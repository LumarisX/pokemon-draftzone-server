import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { S3Service } from "@core/storage/s3.service";
import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import { getName } from "@modules/data/domain/pokedex";
import { DiscordService } from "@modules/discord/discord.service";
import { isTeamRosterValid } from "@modules/draft/domain/tier-cost";
import {
  DraftRepository,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { getLatestRoster } from "@modules/stage/domain/roster";
import {
  rosterContextForTournament,
  stageRounds,
  usesTournamentAxis,
} from "@modules/stage/domain/stage-axis";
import {
  calculateDivisionPokemonStandings,
  calculateDivisionTeamStandings,
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
import { isActiveCoach } from "@modules/tournament/membership";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder } from "discord.js";
import { Types } from "mongoose";
import { HostedTournament, TournamentRule } from "./hosted-tournament.domain";
import {
  CoachAssignmentDto,
  DecideApplicationDto,
  ReplaceCoachDto,
  RuleSectionDto,
  SignUpDto,
  UpdateCoachDetailsDto,
  UpdateCoachLogoDto,
  UpdateHostedTournamentSettingsDto,
} from "./hosted-tournament.dto";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  activeQuestions,
  answerBool,
  answerText,
  DROPPED_BEFORE_QUESTION_ID,
  DROPPED_WHY_QUESTION_ID,
  EXPERIENCE_QUESTION_ID,
  SubmittedAnswer,
  validateAnswers,
} from "./signup-questions";

const DISCORD_EMBED_FIELDS = 25;
const BASE_EMBED_FIELDS = 4;

@Injectable()
export class HostedTournamentService {
  private readonly logger = new Logger(HostedTournamentService.name);

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
    private readonly transactions: TransactionRunner,
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
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach || coach.leftAt)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const stages = await this.stageRepo.findAllByTournament(tournament.id);
    const played = await this.matchupRepo.findByStages(
      stages.map((stage) => stage._id),
      { teamIds: [team._id] },
    );
    if (played.length > 0)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_HAS_MATCHES, {
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
    stageSlug?: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const team = await this.teamRepo.findBySlug(teamSlug);

    const migrated = usesTournamentAxis(tournament);
    const canSeeHidden = sub ? tournament.isOrganizer(sub) : false;
    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const stageDoc = migrated
      ? stages[0]
      : await this.resolveStage(tournament.id, stageSlug);
    const coach = team.primaryCoach;

    const viewerIsCoach = isCoachedBy(team, sub, "chat");
    const identity = {
      id: team._id.toString(),
      slug: team.slug,
      coachId: coach._id.toString(),
      isCoach: viewerIsCoach,
      pointTotal: tournament.pointTotal,
      ...(viewerIsCoach
        ? { gameName: coach.gameName, discordName: coach.discordName }
        : {}),
    };

    if (!stageDoc) {
      const roster = getLatestRoster(
        team,
        rosterContextForTournament(tournament),
      ).map((pokemon) => ({
        id: pokemon.id,
        name: getName(pokemon.id),
        cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
        draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
        ...(tournament.tierList.hasPokemon(pokemon.id)
          ? {}
          : { missingFromTierList: true as const }),
      }));
      return {
        ...identity,
        name: team.teamName,
        timezone: coach.timezone,
        coach: coach.name,
        logo: team.logo,
        draft: roster,
        matchups: [],
      };
    }

    const stage = stageDoc;

    const draftRoster: ({
      id: string;
      name: string;
      cost: number | undefined;
      draftFormes?: { id: string; name: string }[];
    } & { record?: unknown })[] = getLatestRoster(
      team,
      rosterContextForTournament(tournament, stage),
    ).map((pokemon) => ({
      id: pokemon.id,
      name: getName(pokemon.id),
      cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
      draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
      ...(tournament.tierList.hasPokemon(pokemon.id)
        ? {}
        : { missingFromTierList: true as const }),
    }));

    const teamMatchups = (await this.matchupRepo.findByStages(
      migrated ? stages.map((s) => s._id) : [stage._id],
      { teamIds: [team._id] },
    )) as unknown as PopulatedStageMatchup[];

    const pokemonStandings = await calculateDivisionPokemonStandings(
      teamMatchups,
      team._id.toString(),
    );

    pokemonStandings.forEach((pokemon) => {
      const draftPokemonEntry = draftRoster.find((p) => p.id === pokemon.id);
      if (draftPokemonEntry) draftPokemonEntry.record = pokemon.record;
    });

    const teamRecord = await calculateTeamScore(
      teamMatchups,
      stageRounds(stage, tournament),
      team,
      tournament.forfeit,
    );

    return {
      ...identity,
      name: team.teamName,
      timezone: coach.timezone,
      coach: coach.name,
      logo: team.logo,
      draft: draftRoster,
      matchups: teamMatchups,
      record: {
        wins: teamRecord.wins,
        losses: teamRecord.losses,
        pokemonDiff: teamRecord.pokemonDiff,
        gameDiff: teamRecord.gameDiff,
      },
    };
  }

  private async resolveStage(
    tournamentId: Types.ObjectId | string,
    stageSlug?: string,
  ): Promise<StageDocument | undefined> {
    if (stageSlug) return this.stageRepo.findBySlug(stageSlug);

    const stages = await this.stageRepo.findAllByTournament(tournamentId);
    if (stages.length === 0) return undefined;
    if (stages.length === 1) return stages[0];

    throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
      reason: "Multiple stages exist for this tournament; pass stageSlug",
    });
  }

  async getStandings(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );

    const canSeeHidden = sub ? tournament.isOrganizer(sub) : false;
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

    const views: Record<
      string,
      {
        teamStandings: {
          diffMode: "game" | "pokemon";
          teams: unknown[];
        };
        pokemonStandings: unknown[];
      }
    > = {};

    for (const stage of composedStages) {
      const axisRounds = stageRounds(stage, tournament);
      const matchups = (await this.matchupRepo.findByRoundsInStage(
        stage._id,
        axisRounds.map((r) => r._id),
      )) as unknown as PopulatedStageMatchup[];

      const { teamStandings, diffMode } = await calculateDivisionTeamStandings(
        matchups,
        stage,
        tournament,
      );
      views[stage.slug] = {
        teamStandings: { diffMode, teams: teamStandings },
        pokemonStandings: await calculateDivisionPokemonStandings(matchups),
      };
    }

    const allTeamsById = new Map<string, PopulatedTeam>();
    for (const stage of composedStages) {
      for (const team of stage.teams)
        allTeamsById.set(team._id.toString(), team);
    }
    const combinedStage = {
      rounds: [],
      teams: Array.from(allTeamsById.values()),
    } as unknown as StageDocument & { teams: PopulatedTeam[] };
    const allMatchups = (await this.matchupRepo.findByStages(
      visibleStages.map((s) => s._id),
    )) as unknown as PopulatedStageMatchup[];
    const { teamStandings: combinedTeamStandings, diffMode: combinedDiffMode } =
      await calculateDivisionTeamStandings(
        allMatchups,
        combinedStage,
        tournament,
      );
    views.all = {
      teamStandings: {
        diffMode: combinedDiffMode,
        teams: combinedTeamStandings,
      },
      pokemonStandings: await calculateDivisionPokemonStandings(allMatchups),
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
      ? tournament.isOrganizer(sub) ||
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
      drafts: drafts.map((draft) => ({
        draftSlug: draft.slug,
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

  async listTeams(leagueSlug: string, tournamentSlug: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const [teams, drafts, tierList] = await Promise.all([
      this.teamRepo.findAllByTournament(tournament.id),
      this.draftRepo.findAllByTournament(tournament.id),
      tournament.tierListId
        ? this.tierListRepo.findById(tournament.tierListId).catch(() => null)
        : null,
    ]);
    const draftById = new Map(
      drafts.map((draft) => [
        draft._id.toString(),
        { draftSlug: draft.slug, name: draft.name },
      ]),
    );

    const context = rosterContextForTournament(tournament);

    return {
      teams: teams.map((team) => ({
        id: team._id.toString(),
        slug: team.slug,
        teamName: team.teamName,
        coachName: team.primaryCoach.name,
        logo: team.logo,
        pickCount: team.pickLog?.length ?? 0,
        status: team.status,
        draft: team.draftId
          ? (draftById.get(team.draftId.toString()) ?? null)
          : null,
        roster: getLatestRoster(team, context).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          cost: tierList?.getPokemonCost(pokemon.id, pokemon.addons),
          tier: tierList?.getPokemonTier(pokemon.id)?.name,
          ...(tierList && !tierList.hasPokemon(pokemon.id)
            ? { missingFromTierList: true as const }
            : {}),
        })),
      })),
    };
  }

  async listTeamsByDraft(
    leagueSlug: string,
    tournamentSlug: string,
    sub?: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const [teams, drafts] = await Promise.all([
      this.teamRepo.findAllByTournament(tournament.id),
      this.draftRepo.findAllByTournament(tournament.id),
    ]);

    const canSeeHidden = sub ? tournament.isOrganizer(sub) : false;
    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const stage = stages[0];

    const roster = rosterContextForTournament(tournament, stage);

    const matchups = stage
      ? ((await this.matchupRepo.findByStages(
          stages.map((s) => s._id),
        )) as unknown as PopulatedStageMatchup[])
      : [];
    const pokemonStandings = await calculateDivisionPokemonStandings(matchups);
    const rounds = stage ? stageRounds(stage, tournament) : [];

    const composed = await Promise.all(
      teams
        .filter((team) => team.status === "approved")
        .map(async (team) => {
          const teamId = team._id.toString();
          const score = stage
            ? await calculateTeamScore(
                matchups,
                rounds,
                team,
                tournament.forfeit,
              )
            : undefined;

          return {
            draftId: team.draftId?.toString() ?? null,
            team: {
              id: teamId,
              slug: team.slug,
              name: team.teamName,
              coach: team.primaryCoach.name,
              logo: team.logo,
              timezone: team.primaryCoach.timezone,
              isCoach: isCoachedBy(team, sub, "chat"),
              draft: getLatestRoster(team, roster).map((pokemon) => ({
                id: pokemon.id,
                name: getName(pokemon.id),
                capt: { tera: pokemon.addons?.includes("Tera Captain") },
                cost: tournament.tierList.getPokemonCost(
                  pokemon.id,
                  pokemon.addons,
                ),
                draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
                ...(tournament.tierList.hasPokemon(pokemon.id)
                  ? {}
                  : { missingFromTierList: true as const }),
                record: pokemonStandings.find(
                  (p) => p.id === pokemon.id && p.teamId === teamId,
                )?.record,
              })),
              ...(score
                ? {
                    record: {
                      wins: score.wins,
                      losses: score.losses,
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

    const draftIds = new Set(drafts.map((draft) => draft._id.toString()));
    const groups: {
      draftSlug: string | null;
      name: string;
      teams: (typeof composed)[number]["team"][];
    }[] = drafts.map((draft) => ({
      draftSlug: draft.slug,
      name: draft.name,
      teams: composed
        .filter((entry) => entry.draftId === draft._id.toString())
        .map((entry) => entry.team),
    }));

    const unassigned = composed
      .filter((entry) => !entry.draftId || !draftIds.has(entry.draftId))
      .map((entry) => entry.team);
    if (unassigned.length)
      groups.push({ draftSlug: null, name: "Unassigned", teams: unassigned });

    return { drafts: groups };
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
      draft: null,
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

      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, {
        tournamentId: tournament.id,
      });
    }
    const { coach, team } = signup;

    let draft: { draftSlug: string; name: string } | null = null;
    if (team.draftId) {
      const d = await this.draftRepo.findById(team.draftId);
      if (d) draft = { draftSlug: d.slug, name: d.name };
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
      draft,
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
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    const existing = await this.findSignupForTournament(sub, tournament.id);
    if (existing)
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    if (dto.logo && this.s3Service.isEnabled()) {
      const { exists } = await this.s3Service.headObject(dto.logo);
      if (!exists) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
    }

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

    await this.notifySignup(tournament, dto, answers);

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
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const application = await this.applicationRepo.findById(applicationId);
    if (application.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    if (dto.status !== "approved" && application.resultingTeamId)
      throw new PDZError(ErrorCodes.LEAGUE.APPLICATION_HAS_TEAM, {
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
      await this.grantCoachRole(tournament, application.discordName);
      return decided;
    }

    const coachId = new Types.ObjectId();
    const teamId = new Types.ObjectId();

    const decided = await this.transactions.run(async () => {
      await this.assertRosterHasRoom(tournament);

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

    await this.grantCoachRole(tournament, application.discordName);

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
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const team = await this.teamRepo.findBySlug(teamSlug);
    if (team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const application = await this.applicationRepo.findById(dto.applicationId);
    if (application.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    if (application.resultingCoachId)
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
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
                round:
                  tournament.currentRoundIndex >= 0
                    ? tournament.currentRoundIndex
                    : undefined,
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

    await this.grantCoachRole(tournament, application.discordName);

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
      throw new PDZError(ErrorCodes.LEAGUE.SIGNUP_CLOSED, {
        tournamentId: tournament.id,
      });

    if (tournament.signUpAccess === "invite" && !invited)
      throw new PDZError(ErrorCodes.LEAGUE.INVITE_REQUIRED, {
        tournamentId: tournament.id,
      });

    const deadline = tournament.signUpDeadline?.getTime();
    if (deadline !== undefined && Date.now() > deadline && !invited)
      throw new PDZError(ErrorCodes.LEAGUE.SIGNUP_CLOSED, {
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
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const signUpToken = generateSlug(22);
    await this.tournamentRepo.updateSettings(tournament.id, {
      signUpToken,
      signUpTokenRotatedAt: new Date(),
    });

    return { signUpToken, signUpTokenRotatedAt: new Date() };
  }

  private async assertRosterHasRoom(
    tournament: HostedTournament,
    incoming = 1,
  ) {
    if (tournament.maxTeams === undefined) return;
    const approved = await this.teamRepo.countApprovedByTournament(
      tournament.id,
    );
    if (approved + incoming > tournament.maxTeams)
      throw new PDZError(ErrorCodes.LEAGUE.TOURNAMENT_FULL, {
        tournamentId: tournament.id,
        maxTeams: tournament.maxTeams,
      });
  }

  private async grantCoachRole(
    tournament: HostedTournament,
    discordName: string | undefined,
  ) {
    try {
      const { guildId, coachRoleId, autoGrantCoachRole } =
        tournament.discordSettings ?? {};
      if (autoGrantCoachRole === false) return;

      const handle = discordName?.trim();
      if (!handle || !guildId || !coachRoleId) return;

      const member = await this.discordService.findMember(guildId, handle);
      if (member) {
        await this.discordService.grantRole(guildId, member.id, coachRoleId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to grant the coach role: ${(error as Error).message}`,
      );
    }
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

    if (!tournament.isOrganizer(sub)) {
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
    const draftIdToKey = new Map(drafts.map((d) => [d._id.toString(), d.slug]));

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
        const draft = team?.draftId
          ? draftIdToKey.get(team.draftId.toString())
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
          draft,
          inDiscordServer,
          hasDiscordRole,
          hasValidTeam,
        };
      }),
    );

    return {
      signups,
      drafts: drafts.map((d) => ({
        draftSlug: d.slug,
        name: d.name,
      })),
    };
  }

  async assignCoaches(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    assignments: CoachAssignmentDto[],
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    const draftsByKey = new Map(drafts.map((d) => [d.slug, d]));

    const planned: {
      team: PopulatedTeam;
      draftId: Types.ObjectId | null;
      status?: CoachAssignmentDto["status"];
    }[] = [];
    const unresolvedCoachIds: string[] = [];

    for (const assignment of assignments) {
      const team = await this.findTournamentTeamByCoachId(
        assignment.coachId,
        tournament.id,
      );
      if (!team) {
        unresolvedCoachIds.push(assignment.coachId);
        continue;
      }

      const targetDraft = assignment.divisionKey
        ? draftsByKey.get(assignment.divisionKey)
        : null;
      if (assignment.divisionKey && !targetDraft)
        throw new PDZError(ErrorCodes.DRAFT.NOT_IN_LEAGUE, {
          draftSlug: assignment.divisionKey,
          tournamentSlug: tournament.slug,
        });

      planned.push({
        team,
        draftId: targetDraft?._id ?? null,
        status: assignment.status,
      });
    }

    if (unresolvedCoachIds.length)
      throw new PDZError(ErrorCodes.LEAGUE.ASSIGNMENT_COACHES_NOT_FOUND, {
        coachIds: unresolvedCoachIds,
      });

    const reinstated = planned.filter(
      ({ team, status }) => status === "approved" && team.status !== "approved",
    ).length;
    if (reinstated) await this.assertRosterHasRoom(tournament, reinstated);

    for (const { team, draftId, status } of planned) {
      await this.teamRepo.update(team._id, { draftId, status });
    }

    return { message: "Update successful." };
  }

  private async findTournamentTeamByCoachId(
    coachId: string,
    tournamentId: string,
  ): Promise<PopulatedTeam | null> {
    if (!Types.ObjectId.isValid(coachId)) return null;
    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach) return null;
    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournamentId) return null;
    return team;
  }

  async getCoach(leagueSlug: string, tournamentSlug: string, coachId: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

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
    const { coach, team } = await this.loadCoachForEdit(
      leagueSlug,
      tournamentSlug,
      coachId,
      sub,
    );

    const { teamName, ...coachFields } = dto;
    const changes = Object.fromEntries(
      Object.entries(coachFields).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length) {
      await this.coachRepo.update(coach._id, changes);
    }
    if (teamName !== undefined) {
      await this.teamRepo.update(team._id, { teamName });
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

    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const isActiveSelf = isOwnedBy(coach, sub) && isActiveCoach(coach);
    if (!tournament.isOrganizer(sub) && !isActiveSelf)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    return { tournament, coach, team };
  }

  async setCoachLogo(
    leagueSlug: string,
    tournamentSlug: string,
    coachId: string,
    sub: string,
    dto: UpdateCoachLogoDto,
  ) {
    const { team } = await this.loadCoachForEdit(
      leagueSlug,
      tournamentSlug,
      coachId,
      sub,
    );

    if (this.s3Service.isEnabled()) {
      const { exists } = await this.s3Service.headObject(dto.fileKey);
      if (!exists) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
    }

    await this.teamRepo.update(team._id, { logo: dto.fileKey });

    return { message: "Logo updated.", logo: dto.fileKey };
  }

  async getRules(leagueSlug: string, tournamentSlug: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    return tournament.rules;
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
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }

    const rules = ruleSections.map(
      (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
    );
    await this.tournamentRepo.updateRules(tournamentSlug, rules);
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
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }
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
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }

    const targetTierListId = dto.tierListId ?? tournament.tierListId;
    const tierList = targetTierListId
      ? await this.tierListRepo.findById(targetTierListId)
      : null;

    const effectiveMax = dto.draftCount?.max ?? tournament.draftCount.max;
    if (dto.tierRequirements?.length) {
      if (!tierList) {
        throw new PDZError(ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED, {
          tournamentSlug: tournament.slug,
          operation: "tierRequirements",
        });
      }
      const tierIds = new Set(tierList.tiers.map((tier) => tier.id));
      const unknownTier = dto.tierRequirements.find(
        (req) => !tierIds.has(req.tierId),
      );
      if (unknownTier) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: `Tier "${unknownTier.tierId}" does not exist on this tier list`,
        });
      }
      const totalRequired = dto.tierRequirements.reduce(
        (sum, req) => sum + req.required,
        0,
      );
      if (totalRequired > effectiveMax) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: `Required picks (${totalRequired}) exceed the maximum roster size (${effectiveMax})`,
        });
      }
      const invertedTier = dto.tierRequirements.find(
        (req) => req.max != null && req.max < req.required,
      );
      if (invertedTier) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: `Tier "${invertedTier.tierId}" allows at most ${invertedTier.max} picks but requires ${invertedTier.required}`,
        });
      }
    }

    if (dto.prizeSplit?.length) {
      const places = new Set(dto.prizeSplit.map((share) => share.place));
      if (places.size !== dto.prizeSplit.length) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: "Each place may appear only once in the prize split",
        });
      }
      const totalPercent = dto.prizeSplit.reduce(
        (sum, share) => sum + share.percent,
        0,
      );
      if (totalPercent !== 100) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: `Prize shares total ${totalPercent}%, not 100%`,
        });
      }
    }

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
      if (dto.logo && this.s3Service.isEnabled()) {
        const { exists } = await this.s3Service.headObject(dto.logo);
        if (!exists) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
      }
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
    if (dto.tierListId !== undefined) {
      if (!Types.ObjectId.isValid(dto.tierListId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          tierListId: dto.tierListId,
        });
      update["tierList"] = new Types.ObjectId(dto.tierListId);
    }
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
    return { success: true };
  }

  private async notifySignup(
    tournament: HostedTournament,
    dto: SignUpDto,
    answers: SubmittedAnswer[],
  ) {
    try {
      const { signUpChannelId } = tournament.discordSettings ?? {};

      if (!signUpChannelId) return;

      const totalCoaches = await this.applicationRepo.countByStatuses(
        tournament.id,
        ["pending", "waitlisted", "approved"],
      );

      const clamp = (value: string, limit: number) =>
        value.length > limit ? `${value.slice(0, limit - 3)}...` : value;

      const labels = new Map(
        activeQuestions(tournament.signUpQuestions).map((question) => [
          question.id,
          question.label,
        ]),
      );
      const answerFields = answers
        .slice(0, DISCORD_EMBED_FIELDS - BASE_EMBED_FIELDS)
        .map((answer) => ({
          name: clamp(labels.get(answer.questionId) ?? answer.questionId, 256),
          value: clamp(answer.values.join(", ") || "-", 1024),
          inline: false,
        }));

      const embed = new EmbedBuilder()
        .setTitle(clamp(dto.name, 256))
        .setColor("#2F80ED")
        .setTimestamp(new Date())
        .addFields(
          { name: "Team Name", value: dto.teamName, inline: true },
          { name: "In-Game Name", value: dto.gameName, inline: true },
          { name: "Discord Name", value: dto.discordName, inline: true },
          { name: "Timezone", value: dto.timezone, inline: true },
          ...answerFields,
        );

      if (dto.logo && this.s3Service.isEnabled()) {
        embed.setImage(this.s3Service.getPublicUrl(dto.logo));
      }

      await this.discordService.sendMessage(signUpChannelId, {
        content: `There's a new sign up for **${tournament.name}**! Total sign ups: ${totalCoaches}`,
        embeds: [embed],
      });
    } catch (discordError) {
      this.logger.warn("Failed to send Discord notification", discordError);
    }
  }
}
