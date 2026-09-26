import { TransactionRunner } from "@core/database/transaction-runner";
import { nullIfNotFound, PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { S3Service } from "@core/storage/s3.service";
import { UploadFolder } from "@modules/upload/upload-folder.enum";
import { UploadsService } from "@modules/upload/upload.service";
import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DiscordService } from "@modules/discord/discord.service";
import {
  canSeeTeamPicks,
  duplicatesAllowed,
} from "@modules/draft/domain/pick-visibility";
import { isTeamRosterValid } from "@modules/draft/domain/tier-cost";
import { DraftDocument } from "@modules/draft/draft.schema";
import {
  DraftRepository,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import {
  captainRosterRow,
  rosterRow,
} from "@modules/stage/domain/roster-row";
import { rosterContext } from "@modules/stage/domain/stage-axis";
import {
  calculatePokemonStandings,
  calculateTeamStandings,
  calculateTeamScore,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { isCoachedBy } from "@modules/team/team.domain";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { TournamentApplicationDocument } from "@modules/tournament-application/tournament-application.schema";
import { actingCoach, isActiveCoach } from "@modules/tournament/membership";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Types } from "mongoose";
import {
  assertPrizeSplit,
  assertRosterRules,
  HostedTournament,
  TournamentRule,
} from "./hosted-tournament.domain";
import {
  DecideApplicationDto,
  ReplaceCoachDto,
  RuleSectionDto,
  SignUpDto,
  TeamAssignmentDto,
  UpdateCoachDetailsDto,
  UpdateHostedTournamentSettingsDto,
  UpdateTeamDto,
} from "./hosted-tournament.dto";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  StandingsResponse,
  TeamListResponse,
  TeamPageResponse,
  TeamsByPoolResponse,
} from "./hosted-tournament.responses";
import {
  activeQuestions,
  answerBool,
  answerText,
  DROPPED_BEFORE_QUESTION_ID,
  DROPPED_WHY_QUESTION_ID,
  EXPERIENCE_QUESTION_ID,
  validateAnswers,
} from "./signup-questions";
import {
  ApplicationSubmittedEvent,
  CoachSeatedEvent,
  TOURNAMENT_EVENTS,
} from "./tournament-events";

@Injectable()
export class HostedTournamentService {
  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
    private readonly applicationRepo: TournamentApplicationRepository,
    private readonly draftRepo: DraftRepository,
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly discordService: DiscordService,
    private readonly s3Service: S3Service,
    private readonly uploads: UploadsService,
    private readonly transactions: TransactionRunner,
    private readonly events: EventEmitter2,
  ) {}

  async removeParticipant(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    coachId: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageParticipants");
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findByIdOrNull(coachId);
    if (!coach || coach.leftAt)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    const stages = await this.stageRepo.findAllByTournament(tournament.id);
    const played = await this.matchupRepo.findByStages(
      stages.map((stage) => stage._id),
      { teamIds: [team._id] },
    );
    if (played.length > 0)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_HAS_MATCHES, {
        coachId,
        matchups: played.length,
      });

    await this.transactions.run(async () => {
      await this.teamRepo.delete(team._id);
      await this.coachRepo.deleteAllByTeam(team._id);
      await this.applicationRepo.denyAllForTeam(team._id, sub);
    });

    return { message: "Participant removed." };
  }

  async getTeam(
    leagueSlug: string,
    tournamentSlug: string,
    teamSlug: string,
    sub?: string,
  ): Promise<TeamPageResponse> {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const team = await this.teamRepo.findBySlug(tournament.id, teamSlug);

    const canSeeHidden = can(tournament, sub, "viewHidden");
    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const coach = team.primaryCoach;

    const viewerIsCoach = isCoachedBy(team, sub, "chat");
    const teamDraft = team.draftId
      ? await this.draftRepo.findById(team.draftId)
      : null;
    const picksHidden =
      !!teamDraft && !canSeeTeamPicks(tournament, teamDraft, team, sub);
    const roster = rosterContext(tournament);
    const identity = {
      id: team._id.toString(),
      slug: team.slug,
      coachId: coach._id.toString(),
      isCoach: viewerIsCoach,
      pointTotal: tournament.pointTotal,
      picksHidden,
      pickCount: team.pickLog?.length ?? 0,
      ...(viewerIsCoach
        ? { gameName: coach.gameName, discordName: coach.discordName }
        : {}),
    };

    const draftRoster: TeamPageResponse["draft"] = (
      picksHidden ? [] : getLatestRoster(team, roster)
    ).map((pokemon) => rosterRow(pokemon, tournament.tierList));

    if (stages.length === 0)
      return {
        ...identity,
        name: team.teamName,
        timezone: coach.timezone,
        coach: coach.name,
        logo: team.logo,
        draft: draftRoster,
      };

    const teamMatchups = (await this.matchupRepo.findByStages(
      stages.map((s) => s._id),
      { teamIds: [team._id] },
    )) as unknown as PopulatedStageMatchup[];

    const pokemonStandings = await calculatePokemonStandings(
      teamMatchups,
      team._id.toString(),
    );

    pokemonStandings.forEach((pokemon) => {
      const draftPokemonEntry = draftRoster.find((p) => p.id === pokemon.id);
      if (draftPokemonEntry) draftPokemonEntry.record = pokemon.record;
    });

    const teamRecord = await calculateTeamScore(
      teamMatchups,
      roster.rounds,
      team,
      tournament,
    );

    return {
      ...identity,
      name: team.teamName,
      timezone: coach.timezone,
      coach: coach.name,
      logo: team.logo,
      draft: draftRoster,
      record: {
        wins: teamRecord.wins,
        draws: teamRecord.draws,
        losses: teamRecord.losses,
        points: teamRecord.points,
        pokemonDiff: teamRecord.pokemonDiff,
        gameDiff: teamRecord.gameDiff,
      },
    };
  }

  async getStandings(
    leagueSlug: string,
    tournamentSlug: string,
    sub?: string,
  ): Promise<StandingsResponse> {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );

    const canSeeHidden = can(tournament, sub, "viewHidden");
    const visibleStages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);

    const composedStages = await Promise.all(
      visibleStages.map((stage) => this.composeStageTeams(stage)),
    );

    const filters = [
      { value: "all", label: "All Stages" },
      ...visibleStages.map((stage) => ({
        value: stage.slug,
        label: stage.name,
      })),
    ];

    const views: StandingsResponse["views"] = {};

    for (const stage of composedStages) {
      const matchups = (await this.matchupRepo.findByRoundsInStage(
        stage._id,
        tournament.rounds.map((r) => r._id),
      )) as unknown as PopulatedStageMatchup[];

      const { teamStandings, diffMode, rules } =
        await calculateTeamStandings(matchups, stage, tournament);
      views[stage.slug] = {
        teamStandings: { diffMode, rules, teams: teamStandings },
        pokemonStandings: await calculatePokemonStandings(matchups),
      };
    }

    const allTeamsById = new Map<string, PopulatedTeam>();
    for (const stage of composedStages) {
      for (const team of stage.teams)
        allTeamsById.set(team._id.toString(), team);
    }
    const combinedStage = {
      teams: Array.from(allTeamsById.values()),
    } as unknown as StageDocument & { teams: PopulatedTeam[] };
    const allMatchups = (await this.matchupRepo.findByStages(
      visibleStages.map((s) => s._id),
    )) as unknown as PopulatedStageMatchup[];
    const combined = await calculateTeamStandings(
      allMatchups,
      combinedStage,
      tournament,
    );
    views.all = {
      teamStandings: {
        diffMode: combined.diffMode,
        rules: combined.rules,
        teams: combined.teamStandings,
      },
      pokemonStandings: await calculatePokemonStandings(allMatchups),
    };

    return { filters, views };
  }

  private async composeStageTeams(
    stage: StageDocument,
  ): Promise<StageDocument & { teams: PopulatedTeam[] }> {
    const teamIds = this.stageRepo.teamIdsInSeedOrder(stage);
    const teams = await this.teamRepo.findManyByIds(teamIds);
    return Object.assign(stage, { teams });
  }

  async getTournament(leagueSlug: string, tournamentSlug: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    return HostedTournamentMapper.toClientPayload(tournament);
  }

  async getInfo(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    const canSeeAllDrafts = sub
      ? can(tournament, sub, "viewHidden") ||
        (await this.findSignupForTournament(sub, tournament.id))?.team
          .status === "approved"
      : false;

    const drafts = canSeeAllDrafts
      ? await this.draftRepo.findAllByTournament(tournament.id)
      : await this.draftRepo.findPublicByTournament(tournament.id);

    return {
      name: tournament.name,
      tournamentSlug: tournament.slug,
      description: tournament.description,
      format: tournament.format?.name ?? null,
      ruleset: tournament.ruleset?.name ?? null,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      logo: tournament.logo,
      pools: drafts.map((draft) => ({
        poolSlug: draft.slug,
        name: draft.name,
      })),
      discord: tournament.discord,
      tierListId: tournament.tierListId,
      draftCount: tournament.draftCount,
      pointTotal: tournament.pointTotal,
      signUpAccess: tournament.signUpAccess,
      signUpQuestions: activeQuestions(tournament.signUpQuestions).map(
        (question) => ({
          id: question.id,
          label: question.label,
          help: question.help,
          type: question.type,
          options: [...question.options],
          required: question.required,
          maxLength: question.maxLength,
          dependsOn: question.dependsOn
            ? {
                questionId: question.dependsOn.questionId,
                equals: question.dependsOn.equals,
              }
            : undefined,
        }),
      ),
    };
  }

  private picksHiddenFor(
    tournament: HostedTournament,
    drafts: DraftDocument[],
    team: PopulatedTeam,
    sub: string | undefined,
  ): boolean {
    const draft = team.draftId
      ? drafts.find((candidate) => candidate._id.equals(team.draftId))
      : undefined;
    return !!draft && !canSeeTeamPicks(tournament, draft, team, sub);
  }

  async listTeams(
    leagueSlug: string,
    tournamentSlug: string,
    sub?: string,
  ): Promise<TeamListResponse> {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const [teams, drafts, tierList] = await Promise.all([
      this.teamRepo.findAllByTournament(tournament.id),
      this.draftRepo.findAllByTournament(tournament.id),
      tournament.tierListId
        ? nullIfNotFound(this.tierListRepo.findById(tournament.tierListId))
        : null,
    ]);
    const poolById = new Map(
      drafts.map((draft) => [
        draft._id.toString(),
        { poolSlug: draft.slug, name: draft.name },
      ]),
    );

    const context = rosterContext(tournament);

    return {
      teams: teams.map((team) => {
        const picksHidden = this.picksHiddenFor(tournament, drafts, team, sub);
        return {
          id: team._id.toString(),
          slug: team.slug,
          teamName: team.teamName,
          coachName: team.primaryCoach.name,
          logo: team.logo,
          pickCount: team.pickLog?.length ?? 0,
          status: team.status,
          picksHidden,
          pool: team.draftId
            ? (poolById.get(team.draftId.toString()) ?? null)
            : null,
          roster: (picksHidden ? [] : getLatestRoster(team, context)).map(
            (pokemon) => ({
              id: pokemon.id,
              name: getName(pokemon.id),
              cost: tierList?.getPokemonCost(pokemon.id, pokemon.addons),
              tier: tierList?.getPokemonTier(pokemon.id)?.name,
              ...(tierList && !tierList.hasPokemon(pokemon.id)
                ? { missingFromTierList: true as const }
                : {}),
            }),
          ),
        };
      }),
    };
  }

  async listTeamsByPool(
    leagueSlug: string,
    tournamentSlug: string,
    sub?: string,
  ): Promise<TeamsByPoolResponse> {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const [teams, drafts] = await Promise.all([
      this.teamRepo.findAllByTournament(tournament.id),
      this.draftRepo.findAllByTournament(tournament.id),
    ]);

    const canSeeHidden = can(tournament, sub, "viewHidden");
    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const hasStages = stages.length > 0;

    const roster = rosterContext(tournament);

    const matchups = hasStages
      ? ((await this.matchupRepo.findByStages(
          stages.map((s) => s._id),
        )) as unknown as PopulatedStageMatchup[])
      : [];
    const pokemonStandings = await calculatePokemonStandings(matchups);
    const rounds = roster.rounds;

    const composed = await Promise.all(
      teams
        .filter((team) => team.status === "approved")
        .map(async (team) => {
          const teamId = team._id.toString();
          const score = hasStages
            ? await calculateTeamScore(matchups, rounds, team, tournament)
            : undefined;
          const picksHidden = this.picksHiddenFor(
            tournament,
            drafts,
            team,
            sub,
          );

          return {
            poolId: team.draftId?.toString() ?? null,
            team: {
              id: teamId,
              slug: team.slug,
              name: team.teamName,
              coach: team.primaryCoach.name,
              logo: team.logo,
              timezone: team.primaryCoach.timezone,
              isCoach: isCoachedBy(team, sub, "chat"),
              picksHidden,
              pickCount: team.pickLog?.length ?? 0,
              draft: (picksHidden ? [] : getLatestRoster(team, roster)).map(
                (pokemon) => ({
                ...captainRosterRow(pokemon, tournament.tierList),
                record: pokemonStandings.find(
                  (p) => p.id === pokemon.id && p.teamId === teamId,
                )?.record,
              }),
              ),
              ...(score
                ? {
                    record: {
                      wins: score.wins,
                      draws: score.draws,
                      losses: score.losses,
                      points: score.points,
                      pokemonDiff: score.pokemonDiff,
                      gameDiff: score.gameDiff,
                    },
                    diffMode: score.diffMode,
                  }
                : {}),
            },
          };
        }),
    );

    const poolIds = new Set(drafts.map((draft) => draft._id.toString()));
    const groups: TeamsByPoolResponse["pools"] = drafts.map((draft) => ({
      poolSlug: draft.slug,
      name: draft.name,
      allowDuplicates: duplicatesAllowed(draft),
      teams: composed
        .filter((entry) => entry.poolId === draft._id.toString())
        .map((entry) => entry.team),
    }));

    const unassigned = composed
      .filter((entry) => !entry.poolId || !poolIds.has(entry.poolId))
      .map((entry) => entry.team);
    if (unassigned.length)
      groups.push({
        poolSlug: null,
        name: "Unassigned",
        allowDuplicates: false,
        teams: unassigned,
      });

    return { pools: groups };
  }

  async getRoles(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    return tournament.getRoles(sub);
  }

  private async findSignupForTournament(sub: string, tournamentId: string) {
    const coaches = (await this.coachRepo.findByAuth0Id(sub)).filter(
      isActiveCoach,
    );
    if (coaches.length === 0) return null;

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const team = teams.find(
      (candidate) => candidate.tournamentId.toString() === tournamentId,
    );
    if (!team) return null;

    const teamId = team._id.toString();
    const coach = coaches.find(
      (candidate) => candidate.teamId.toString() === teamId,
    );
    if (!coach) return null;

    return { coach, team };
  }

  private async undecidedSignup(
    tournament: HostedTournament,
    application: TournamentApplicationDocument,
  ) {
    const guildId = tournament.discordSettings?.guildId;
    const member = guildId
      ? await this.discordService.findMember(guildId, application.discordName)
      : null;

    return {
      name: application.name,
      gameName: application.gameName,
      discordName: application.discordName,
      timezone: application.timezone,
      teamName: application.preferredTeamName,
      status: application.status,
      logo: application.preferredLogo,
      signedUpAt: application.submittedAt,
      teamId: undefined,
      teamSlug: undefined,
      pool: null,
      inDiscordServer: Boolean(member),
    };
  }

  async getSignup(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    const signup = await this.findSignupForTournament(sub, tournament.id);
    if (!signup) {
      const undecided = await this.applicationRepo.findBlockingApplication(
        tournament.id,
        sub,
      );
      if (undecided) return this.undecidedSignup(tournament, undecided);

      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, {
        tournamentId: tournament.id,
      });
    }
    const { coach, team } = signup;

    let pool: { poolSlug: string; name: string } | null = null;
    if (team.draftId) {
      const d = await this.draftRepo.findById(team.draftId);
      if (d) pool = { poolSlug: d.slug, name: d.name };
    }

    const guildId = tournament.discordSettings?.guildId;
    const member = guildId
      ? await this.discordService.findMember(guildId, coach.discordName)
      : null;
    const inDiscordServer = Boolean(member);

    return {
      name: coach.name,
      gameName: coach.gameName,
      discordName: coach.discordName,
      timezone: coach.timezone,
      teamName: team.teamName,
      status: team.status,
      logo: team.logo,
      signedUpAt: coach.signedUpAt,
      teamId: team._id.toString(),
      teamSlug: team.slug,
      pool,
      inDiscordServer,
    };
  }

  async createSignup(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: SignUpDto,
    invite?: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    if (!dto.confirm) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "confirm",
      });
    }

    this.assertSignUpsOpen(tournament, invite);

    const blocking = await this.applicationRepo.findBlockingApplication(
      tournament.id,
      sub,
    );
    if (blocking)
      throw new PDZError(ErrorCodes.TOURNAMENT.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    const existing = await this.findSignupForTournament(sub, tournament.id);
    if (existing)
      throw new PDZError(ErrorCodes.TOURNAMENT.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    if (dto.logo)
      await this.uploads.claimUpload(dto.logo, {
        uploadedBy: sub,
        folder: UploadFolder.TEAM_LOGOS,
        relatedEntityId: tournament.id,
      });

    const answers = validateAnswers(
      tournament.signUpQuestions,
      dto.answers ?? [],
    );

    const application = await this.applicationRepo.create({
      tournamentId: tournament.id,
      auth0Id: sub,
      name: dto.name,
      gameName: dto.gameName,
      discordName: dto.discordName,
      timezone: dto.timezone,
      experience: answerText(answers, EXPERIENCE_QUESTION_ID),
      droppedBefore: answerBool(answers, DROPPED_BEFORE_QUESTION_ID),
      droppedWhy: answerText(answers, DROPPED_WHY_QUESTION_ID),
      confirmed: dto.confirm,
      preferredTeamName: dto.teamName,
      preferredLogo: dto.logo,
      intent: dto.intent ?? "team",
      status: "pending",
      answers,
    });

    this.events.emit(TOURNAMENT_EVENTS.applicationSubmitted, {
      tournament,
      signUp: dto,
      answers,
    } satisfies ApplicationSubmittedEvent);

    return {
      message: "Sign up successful.",
      applicationId: application._id.toString(),
      tournamentId: tournament.id,
      status: application.status,
    };
  }

  async decideApplication(
    leagueSlug: string,
    tournamentSlug: string,
    applicationId: string,
    sub: string,
    dto: DecideApplicationDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageParticipants");

    const application = await this.applicationRepo.findInTournament(
      tournament.id,
      applicationId,
    );

    if (dto.status !== "approved" && application.resultingTeamId)
      throw new PDZError(ErrorCodes.TOURNAMENT.APPLICATION_HAS_TEAM, {
        applicationId,
      });

    if (dto.status !== "approved") {
      return this.applicationRepo.decide(applicationId, {
        status: dto.status,
        decidedBy: sub,
      });
    }

    if (application.resultingTeamId) {
      return this.applicationRepo.decide(applicationId, {
        status: "approved",
        decidedBy: sub,
      });
    }

    if (application.intent === "sub") {
      const decided = await this.applicationRepo.decide(applicationId, {
        status: "approved",
        decidedBy: sub,
      });
      this.announceCoachSeated(tournament, application.discordName);
      return decided;
    }

    const coachId = new Types.ObjectId();
    const teamId = new Types.ObjectId();

    const decided = await this.transactions.run(async () => {
      await this.reserveRosterRoom(tournament);

      const team = await this.teamRepo.create({
        _id: teamId,
        tournamentId: tournament.id,
        coach: coachId,
        teamName: dto.teamName?.trim() || application.preferredTeamName,
        logo: application.preferredLogo,
        status: "approved",
      });

      const coach = await this.coachRepo.create({
        _id: coachId,
        auth0Id: application.auth0Id,
        name: application.name,
        gameName: application.gameName,
        discordName: application.discordName,
        timezone: application.timezone,
        teamId,
        experience: application.experience,
        droppedBefore: application.droppedBefore,
        droppedWhy: application.droppedWhy,
        confirmed: application.confirmed,
      });

      return this.applicationRepo.decide(applicationId, {
        status: "approved",
        decidedBy: sub,
        resultingTeamId: team._id,
        resultingCoachId: coach._id,
      });
    });

    this.announceCoachSeated(tournament, application.discordName);

    return decided;
  }

  async replaceCoach(
    leagueSlug: string,
    tournamentSlug: string,
    teamSlug: string,
    sub: string,
    dto: ReplaceCoachDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageParticipants");

    const team = await this.teamRepo.findBySlug(tournament.id, teamSlug);

    const application = await this.applicationRepo.findInTournament(
      tournament.id,
      dto.applicationId,
    );
    if (application.resultingCoachId)
      throw new PDZError(ErrorCodes.TOURNAMENT.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    const roster = await this.coachRepo.findAllByTeam(team._id);
    const active = roster.filter(isActiveCoach);
    const outgoing = dto.outgoingCoachId
      ? active.find(
          (candidate) => candidate._id.toString() === dto.outgoingCoachId,
        )
      : (active.find(
          (candidate) =>
            candidate._id.toString() === team.primaryCoach?._id.toString(),
        ) ?? active[0]);

    const previousName = team.teamName;
    const nextName = dto.teamName?.trim() || application.preferredTeamName;

    const { incoming, updated } = await this.transactions.run(async () => {
      if (outgoing) {
        await this.coachRepo.update(outgoing._id, { leftAt: new Date() });
      }

      const incoming = await this.coachRepo.create({
        auth0Id: application.auth0Id,
        name: application.name,
        gameName: application.gameName,
        discordName: application.discordName,
        timezone: application.timezone,
        teamId: team._id,
        experience: application.experience,
        droppedBefore: application.droppedBefore,
        droppedWhy: application.droppedWhy,
        confirmed: application.confirmed,
      });

      const updated = await this.teamRepo.replaceCoach(team._id, {
        primaryCoach: incoming._id,
        teamName: nextName,
        logo: application.preferredLogo ?? team.logo,
        ...(previousName === nextName
          ? {}
          : {
              nameChange: {
                from: previousName,
                to: nextName,
                roundId: tournament.rounds[tournament.currentRoundIndex]?._id,
                reason: dto.reason?.trim() || "Coach replacement",
                changedBy: sub,
              },
            }),
      });

      await this.applicationRepo.decide(application._id, {
        status: "approved",
        decidedBy: sub,
        resultingTeamId: team._id,
        resultingCoachId: incoming._id,
      });

      return { incoming, updated };
    });

    this.announceCoachSeated(tournament, application.discordName);

    return {
      teamId: updated._id.toString(),
      teamSlug: updated.slug,
      teamName: updated.teamName,
      outgoingCoachId: outgoing?._id.toString() ?? null,
      incomingCoachId: incoming._id.toString(),
      renamedFrom: previousName === nextName ? null : previousName,
    };
  }

  private assertSignUpsOpen(
    tournament: HostedTournament,
    invite: string | undefined,
  ) {
    const invited =
      !!tournament.signUpToken && invite === tournament.signUpToken;

    if (tournament.signUpAccess === "closed")
      throw new PDZError(ErrorCodes.TOURNAMENT.SIGNUP_CLOSED, {
        tournamentId: tournament.id,
      });

    if (tournament.signUpAccess === "invite" && !invited)
      throw new PDZError(ErrorCodes.TOURNAMENT.INVITE_REQUIRED, {
        tournamentId: tournament.id,
      });

    const deadline = tournament.signUpDeadline?.getTime();
    if (deadline !== undefined && Date.now() > deadline && !invited)
      throw new PDZError(ErrorCodes.TOURNAMENT.SIGNUP_CLOSED, {
        tournamentId: tournament.id,
        signUpDeadline: tournament.signUpDeadline,
      });
  }

  async rotateSignUpToken(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");

    const signUpToken = generateSlug(22);
    await this.tournamentRepo.updateSettings(tournament.id, {
      signUpToken,
      signUpTokenRotatedAt: new Date(),
    });

    return { signUpToken, signUpTokenRotatedAt: new Date() };
  }

  private async reserveRosterRoom(
    tournament: HostedTournament,
    incoming = 1,
  ) {
    if (tournament.maxTeams === undefined) return;
    await this.tournamentRepo.bumpRosterVersion(tournament.id);
    const approved = await this.teamRepo.countApprovedByTournament(
      tournament.id,
    );
    if (approved + incoming > tournament.maxTeams)
      throw new PDZError(ErrorCodes.TOURNAMENT.FULL, {
        tournamentId: tournament.id,
        maxTeams: tournament.maxTeams,
      });
  }

  async getCoaches(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const teams = await this.teamRepo.findAllByTournament(tournament.id);

    if (!can(tournament, sub, "manageParticipants")) {
      return teams
        .filter((team) => team.status === "approved")
        .map((team) => ({
          id: team.primaryCoach?._id.toString(),
          teamId: team._id.toString(),
          teamSlug: team.slug,
          teamName: team.teamName,
          coachName: team.primaryCoach.name,
          logo: team.logo,
          status: team.status,
        }));
    }

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    const poolSlugsById = new Map(drafts.map((d) => [d._id.toString(), d.slug]));

    const tierList = await this.tierListRepo.findById(tournament.tierListId);
    const populatedTournament = Object.assign(tournament, {
      tierList,
    }) as PopulatedTournament;

    const { guildId, coachRoleId } = tournament.discordSettings ?? {};

    const applications = await this.applicationRepo.findAllByTournament(
      tournament.id,
    );
    const teamById = new Map(teams.map((team) => [team._id.toString(), team]));
    const questionLabels = new Map(
      tournament.signUpQuestions.map((question) => [
        question.id,
        question.label,
      ]),
    );

    const signups = await Promise.all(
      applications.map(async (application) => {
        const team = application.resultingTeamId
          ? teamById.get(application.resultingTeamId.toString())
          : undefined;
        const coach = application.resultingCoachId
          ? team?.coaches?.find((member) =>
              member._id.equals(application.resultingCoachId),
            )
          : undefined;
        const discordName = coach?.discordName ?? application.discordName;
        const poolSlug = team?.draftId
          ? poolSlugsById.get(team.draftId.toString())
          : undefined;
        const member = guildId
          ? await this.discordService.findMember(guildId, discordName)
          : null;
        const inDiscordServer = Boolean(member);
        const hasDiscordRole = Boolean(
          coachRoleId && member?.roleIds.includes(coachRoleId),
        );
        const hasValidTeam = team
          ? await isTeamRosterValid(populatedTournament, team)
          : false;
        const logoKey = team?.logo ?? application.preferredLogo;
        return {
          id: application.resultingCoachId?.toString(),
          applicationId: application._id.toString(),
          teamId: team?._id.toString(),
          teamSlug: team?.slug,
          name: coach?.name ?? application.name,
          gameName: coach?.gameName ?? application.gameName,
          discordName,
          timezone: coach?.timezone ?? application.timezone,
          experience: application.experience,
          dropped: application.droppedBefore
            ? application.droppedWhy
            : undefined,
          answers: application.answers.map((answer) => ({
            questionId: answer.questionId,
            label: questionLabels.get(answer.questionId) ?? answer.questionId,
            values: [...answer.values],
          })),
          status: team?.status === "dropped" ? "dropped" : application.status,
          departed: Boolean(coach?.leftAt),
          intent: application.intent,
          teamName: team?.teamName ?? application.preferredTeamName,
          signedUpAt: application.submittedAt,
          logo:
            logoKey && this.s3Service.isEnabled()
              ? this.s3Service.getPublicUrl(logoKey)
              : undefined,
          poolSlug,
          inDiscordServer,
          hasDiscordRole,
          hasValidTeam,
        };
      }),
    );

    return {
      signups,
      pools: drafts.map((d) => ({
        poolSlug: d.slug,
        name: d.name,
      })),
    };
  }

  async assignTeams(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    assignments: TeamAssignmentDto[],
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageParticipants");

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    const poolsBySlug = new Map(drafts.map((d) => [d.slug, d]));
    const teams = await this.teamRepo.findAllByTournament(tournament.id);
    const teamsBySlug = new Map(teams.map((team) => [team.slug, team]));

    const planned: {
      team: PopulatedTeam;
      draftId: Types.ObjectId | null;
      status?: TeamAssignmentDto["status"];
    }[] = [];
    const unresolvedTeamSlugs: string[] = [];

    for (const assignment of assignments) {
      const team = teamsBySlug.get(assignment.teamSlug);
      if (!team) {
        unresolvedTeamSlugs.push(assignment.teamSlug);
        continue;
      }

      const targetPool = assignment.poolSlug
        ? poolsBySlug.get(assignment.poolSlug)
        : null;
      if (assignment.poolSlug && !targetPool)
        throw new PDZError(ErrorCodes.TOURNAMENT.POOL_NOT_FOUND, {
          poolSlug: assignment.poolSlug,
          tournamentSlug: tournament.slug,
        });

      planned.push({
        team,
        draftId: targetPool?._id ?? null,
        status: assignment.status,
      });
    }

    if (unresolvedTeamSlugs.length)
      throw new PDZError(ErrorCodes.TOURNAMENT.ASSIGNMENT_TEAMS_NOT_FOUND, {
        teamSlugs: unresolvedTeamSlugs,
      });

    const reinstated = planned.filter(
      ({ team, status }) => status === "approved" && team.status !== "approved",
    ).length;
    await this.transactions.run(async () => {
      if (reinstated) await this.reserveRosterRoom(tournament, reinstated);

      for (const { team, draftId, status } of planned) {
        await this.teamRepo.update(team._id, { draftId, status });
      }
    });

    return { message: "Update successful." };
  }

  async getCoach(leagueSlug: string, tournamentSlug: string, coachId: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findByIdOrNull(coachId);
    if (!coach)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    return {
      id: coach._id.toString(),
      teamName: team.teamName,
      coachName: coach.name,
      logo: team.logo,
      status: team.status,
    };
  }

  async updateCoachDetails(
    leagueSlug: string,
    tournamentSlug: string,
    coachId: string,
    sub: string,
    dto: UpdateCoachDetailsDto,
  ) {
    const { coach } = await this.loadCoachForEdit(
      leagueSlug,
      tournamentSlug,
      coachId,
      sub,
    );

    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length) {
      await this.coachRepo.update(coach._id, changes);
    }

    return { message: "Details updated." };
  }

  private async loadCoachForEdit(
    leagueSlug: string,
    tournamentSlug: string,
    coachId: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findByIdOrNull(coachId);
    if (!coach)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });

    const isActiveSelf = isOwnedBy(coach, sub) && isActiveCoach(coach);
    if (!can(tournament, sub, "manageParticipants") && !isActiveSelf)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    return { tournament, coach, team };
  }

  async updateTeam(
    leagueSlug: string,
    tournamentSlug: string,
    teamSlug: string,
    sub: string,
    dto: UpdateTeamDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const team = await this.teamRepo.findBySlug(tournament.id, teamSlug);
    if (
      !can(tournament, sub, "manageParticipants") &&
      !actingCoach(team, sub, "manageRoster")
    )
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const renamed = dto.teamName !== undefined && dto.teamName !== team.teamName;
    const relogo = dto.logo !== undefined && dto.logo !== team.logo;
    if (!renamed && !relogo)
      return { teamName: team.teamName, logo: team.logo ?? null };

    if (relogo)
      await this.uploads.claimUpload(dto.logo!, {
        uploadedBy: sub,
        folder: UploadFolder.TEAM_LOGOS,
        relatedEntityId: team._id.toString(),
      });

    const updated = await this.teamRepo.update(team._id, {
      ...(renamed
        ? {
            teamName: dto.teamName,
            nameChange: {
              from: team.teamName,
              to: dto.teamName!,
              roundId: tournament.rounds[tournament.currentRoundIndex]?._id,
              reason: "Renamed",
              changedBy: sub,
            },
          }
        : {}),
      ...(relogo ? { logo: dto.logo } : {}),
    });

    return { teamName: updated.teamName, logo: updated.logo ?? null };
  }

  async getRules(leagueSlug: string, tournamentSlug: string) {
    return this.tournamentRepo.findRulesBySlug(leagueSlug, tournamentSlug);
  }

  async updateRules(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    ruleSections: RuleSectionDto[],
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");

    const rules = ruleSections.map(
      (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
    );
    await this.tournamentRepo.updateRules(tournament.id, rules);
    return { message: "Rules updated successfully" };
  }

  async getSettings(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");
    return HostedTournamentMapper.toSettingsPayload(tournament);
  }

  async updateSettings(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: UpdateHostedTournamentSettingsDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");

    if (
      dto.tierListId !== undefined &&
      !Types.ObjectId.isValid(dto.tierListId)
    )
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        tierListId: dto.tierListId,
      });

    if (
      dto.tierListId !== undefined ||
      dto.tierRequirements !== undefined ||
      dto.draftCount !== undefined
    ) {
      const targetTierListId = dto.tierListId ?? tournament.tierListId;
      const tierList = targetTierListId
        ? await this.tierListRepo.findById(targetTierListId)
        : null;
      assertRosterRules({
        tierIds: tierList ? new Set(tierList.tiers.map((tier) => tier.id)) : null,
        draftCount: dto.draftCount ?? tournament.draftCount,
        tierRequirements: dto.tierRequirements ?? tournament.tierRequirements,
      });
    }

    if (dto.prizeSplit !== undefined) assertPrizeSplit(dto.prizeSplit);

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update["name"] = dto.name;
    if (dto.description !== undefined) update["description"] = dto.description;
    if (dto.signUpDeadline !== undefined)
      update["signUpDeadline"] = dto.signUpDeadline;
    if (dto.draftStart !== undefined) update["draftStart"] = dto.draftStart;
    if (dto.draftEnd !== undefined) update["draftEnd"] = dto.draftEnd;
    if (dto.seasonStart !== undefined) update["seasonStart"] = dto.seasonStart;
    if (dto.seasonEnd !== undefined) update["seasonEnd"] = dto.seasonEnd;
    if (dto.discord !== undefined) update["discord"] = dto.discord;
    if (dto.logo !== undefined) {
      if (dto.logo && dto.logo !== tournament.logo)
        await this.uploads.claimUpload(dto.logo, {
          uploadedBy: sub,
          folder: UploadFolder.TOURNAMENT_LOGOS,
          relatedEntityId: tournament.id,
        });
      update["logo"] = dto.logo;
    }
    if (dto.discordSettings !== undefined) {
      const { coachRoleId, signUpChannelId, autoGrantCoachRole } =
        dto.discordSettings;
      const problems = await this.discordService.findTargetProblems({
        guildId: tournament.discordSettings?.guildId,
        roleId: coachRoleId,
        channelIds: [signUpChannelId],
      });
      if (problems.length)
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: problems.join(" "),
        });
      update["discordSettings.coachRoleId"] = coachRoleId ?? null;
      update["discordSettings.signUpChannelId"] = signUpChannelId ?? null;
      if (autoGrantCoachRole !== undefined)
        update["discordSettings.autoGrantCoachRole"] = autoGrantCoachRole;
    }
    if (dto.forfeit !== undefined) update["forfeit"] = dto.forfeit;
    if (dto.diffMode !== undefined) update["diffMode"] = dto.diffMode;
    if (dto.standingsRules?.points !== undefined) {
      const { win, draw, loss } = dto.standingsRules.points;
      if (!(loss <= draw && draw <= win))
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: "Points must not rank a loss above a draw or a draw above a win.",
        });
      update["standingsRules.points"] = { win, draw, loss };
    }
    if (dto.standingsRules?.tiebreakers !== undefined)
      update["standingsRules.tiebreakers"] = dto.standingsRules.tiebreakers;
    if (dto.tierListId !== undefined)
      update["tierList"] = new Types.ObjectId(dto.tierListId);
    if (dto.draftCount !== undefined) update["draftCount"] = dto.draftCount;
    if (dto.pointTotal !== undefined) update["pointTotal"] = dto.pointTotal;
    if (dto.maxTeams !== undefined) update["maxTeams"] = dto.maxTeams;
    if (dto.signUpQuestions !== undefined)
      update["signUpQuestions"] = dto.signUpQuestions.map((question) => ({
        ...question,
        options: question.options ?? [],
        archived: question.archived ?? false,
      }));
    if (dto.signUpAccess !== undefined) {
      update["signUpAccess"] = dto.signUpAccess;
      if (dto.signUpAccess === "invite" && !tournament.signUpToken) {
        update["signUpToken"] = generateSlug(22);
        update["signUpTokenRotatedAt"] = new Date();
      }
    }
    if (dto.tradePointLimit !== undefined)
      update["tradePointLimit"] = dto.tradePointLimit;
    if (dto.tierRequirements !== undefined)
      update["tierRequirements"] = dto.tierRequirements.map((req) => ({
        tierId: req.tierId,
        required: req.required,
        ...(req.max == null ? {} : { max: req.max }),
      }));
    if (dto.prizeSplit !== undefined) update["prizeSplit"] = dto.prizeSplit;
    if (dto.adSettings !== undefined) update["adSettings"] = dto.adSettings;
    if (dto.archived !== undefined) update["archived"] = dto.archived;
    if (dto.matchSettings !== undefined)
      update["matchSettings"] = {
        chat:
          dto.matchSettings.chat ?? tournament.matchSettings?.chat !== false,
        coachReporting:
          dto.matchSettings.coachReporting ??
          tournament.matchSettings?.coachReporting !== false,
      };

    await this.tournamentRepo.updateSettings(tournament.id, update);
    return { message: "Settings saved." };
  }

  private announceCoachSeated(
    tournament: HostedTournament,
    discordName: string | undefined,
  ) {
    this.events.emit(TOURNAMENT_EVENTS.coachSeated, {
      tournament,
      discordName,
    } satisfies CoachSeatedEvent);
  }
}
