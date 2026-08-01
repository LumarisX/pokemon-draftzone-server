import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { S3Service } from "@core/storage/s3.service";
import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import { DiscordService } from "@modules/discord/discord.service";
import {
  DraftRepository,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { isTeamRosterValid } from "@modules/draft/domain/tier-cost";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { isCoachedBy } from "@modules/team/team.domain";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder } from "discord.js";
import { Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
import { buildBracketView } from "@modules/stage/domain/bracket-view";
import {
  rosterContext,
  stageRounds,
  stageTeamIds,
  tournamentRosterContext,
  usesTournamentAxis,
} from "@modules/stage/domain/stage-axis";
import { getRosterByRound } from "@modules/stage/domain/roster";
import {
  calculateDivisionPokemonStandings,
  calculateTeamScore,
  PopulatedStageMatchup,
} from "@modules/stage/domain/standings";
import { HostedTournament, TournamentRule } from "./hosted-tournament.domain";
import {
  CoachAssignmentDto,
  RuleSectionDto,
  SignUpDto,
  UpdateCoachLogoDto,
  UpdateHostedTournamentSettingsDto,
} from "./hosted-tournament.dto";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";

@Injectable()
export class HostedTournamentService {
  private readonly logger = new Logger(HostedTournamentService.name);

  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
    private readonly draftRepo: DraftRepository,
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly discordService: DiscordService,
    private readonly s3Service: S3Service,
  ) {}

  async getTeam(
    leagueSlug: string,
    tournamentSlug: string,
    teamId: string,
    sub?: string,
    stageId?: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const team = await this.teamRepo.findById(teamId);

    // A team's page is not a stage's page. Rounds and trades belong to the
    // tournament now, and a team's record spans every stage it plays in — so
    // there is nothing here to disambiguate, and asking the caller to pick a
    // stage was the old model leaking out. Before the migration a stage did own
    // both, and a tournament with several genuinely could not answer this,
    // which is what the "pass stageId" error meant.
    const migrated = usesTournamentAxis(tournament);
    const allStages = await this.stageRepo.findAllByTournament(tournament.id);
    const stageDoc = migrated
      ? allStages[0]
      : await this.resolveStage(tournament.id, stageId);
    const coach = team.coach;

    // Contact handles stay private to the team's own coach.
    const viewerIsCoach = isCoachedBy(team, sub);
    const identity = {
      id: team._id.toString(),
      coachId: coach._id.toString(),
      isCoach: viewerIsCoach,
      pointTotal: tournament.pointTotal,
      ...(viewerIsCoach
        ? { gameName: coach.gameName, discordName: coach.discordName }
        : {}),
    };

    if (!stageDoc) {
      const roster = getRosterByRound(team, undefined).map((pokemon) => ({
        id: pokemon.id,
        name: getName(pokemon.id),
        cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
        draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
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

    const stage = await this.composeStageTeams(stageDoc);

    const draftRoster: ({
      id: string;
      name: string;
      cost: number | undefined;
      draftFormes?: { id: string; name: string }[];
    } & { record?: unknown })[] = getRosterByRound(
      team,
      migrated
        ? tournamentRosterContext(tournament)
        : rosterContext(stage, tournament),
    ).map((pokemon) => ({
      id: pokemon.id,
      name: getName(pokemon.id),
      cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
      draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
    }));

    // Every stage the team plays in, not just one: a coach's record covers the
    // group phase and the playoffs together.
    const teamMatchups = (await this.matchupRepo.findByStages(
      migrated ? allStages.map((s) => s._id) : [stage._id],
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
    stageId?: string,
  ): Promise<StageDocument | undefined> {
    if (stageId) return this.stageRepo.findById(stageId);

    const stages = await this.stageRepo.findAllByTournament(tournamentId);
    if (stages.length === 0) return undefined;
    if (stages.length === 1) return stages[0];

    throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
      reason: "Multiple stages exist for this tournament; pass stageId",
    });
  }

  private async composeStageTeams(
    stage: StageDocument,
  ): Promise<StageDocument & { teams: PopulatedTeam[] }> {
    const teamIds = this.stageRepo.flattenPoolTeamIds(stage);
    const teams = await this.teamRepo.findManyByIds(teamIds);
    return Object.assign(stage, { teams }) as StageDocument & {
      teams: PopulatedTeam[];
    };
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
        (await this.findSignupForTournament(sub, tournament.id)) !== null
      : false;

    const drafts = canSeeAllDrafts
      ? await this.draftRepo.findAllByTournament(tournament.id)
      : await this.draftRepo.findPublicByTournament(tournament.id);

    return {
      name: tournament.name,
      tournamentSlug: tournament.slug,
      description: tournament.description,
      format: tournament.format.name,
      ruleset: tournament.ruleset.name,
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
    };
  }

  /** Flat team list for organizer tooling (e.g. picking bracket participants). */
  async listTeams(leagueSlug: string, tournamentSlug: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const [teams, drafts] = await Promise.all([
      this.teamRepo.findAllByTournament(tournament.id),
      this.draftRepo.findAllByTournament(tournament.id),
    ]);
    // Which draft pool a team drafted in — organizers seed brackets across
    // pools, so the pool has to be visible next to each team.
    const draftById = new Map(
      drafts.map((draft) => [
        draft._id.toString(),
        { draftSlug: draft.slug, name: draft.name },
      ]),
    );

    return {
      teams: teams.map((team) => ({
        id: team._id.toString(),
        teamName: team.teamName,
        coachName: team.coach.name,
        logo: team.logo,
        pickCount: team.pickLog?.length ?? 0,
        status: team.status,
        draft: team.draftId
          ? (draftById.get(team.draftId.toString()) ?? null)
          : null,
      })),
    };
  }

  async getBracket(leagueSlug: string, tournamentSlug: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const playoffsStage = tournament.getPlayoffsStage();

    if (!playoffsStage) {
      return { format: null, seeding: null, teams: [], rounds: [], matches: [] };
    }

    const rounds = stageRounds(playoffsStage, tournament);
    // Scoped to the stage too: on a tournament-wide axis every stage shares
    // these rounds, so round alone would sweep in the group phase's matchups.
    const bracketMatchups = await this.matchupRepo.findByRoundsInStage(
      playoffsStage._id,
      rounds.map((round) => round._id.toString()),
    );
    const teamObjIds = stageTeamIds(playoffsStage);
    const teamDocs =
      teamObjIds.length > 0 ? await this.teamRepo.findManyByIds(teamObjIds) : [];

    return buildBracketView(playoffsStage, bracketMatchups, teamDocs, rounds);
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
    const coaches = await this.coachRepo.findByAuth0Id(sub);
    for (const coach of coaches) {
      const team = await this.teamRepo.findByIdOrNull(coach.teamId);
      if (team && team.tournamentId.toString() === tournamentId) {
        return { coach, team };
      }
    }
    return null;
  }

  async getSignup(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    const signup = await this.findSignupForTournament(sub, tournament.id);
    if (!signup)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, {
        tournamentId: tournament.id,
      });
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
      draft,
      inDiscordServer,
    };
  }

  async createSignup(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: SignUpDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    if (dto.droppedBefore && !dto.droppedWhy.trim()) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "droppedWhy",
      });
    }
    if (!dto.confirm) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "confirm",
      });
    }

    const existing = await this.findSignupForTournament(sub, tournament.id);
    if (existing)
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    if (dto.logo && this.s3Service.isEnabled()) {
      const { exists } = await this.s3Service.headObject(dto.logo);
      if (!exists) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
    }

    const coachId = new Types.ObjectId();
    const teamId = new Types.ObjectId();

    await this.teamRepo.create({
      _id: teamId,
      tournamentId: tournament.id,
      coach: coachId,
      teamName: dto.teamName,
      logo: dto.logo,
      status: "pending",
    });

    const leagueCoach = await this.coachRepo.create({
      _id: coachId,
      auth0Id: sub,
      name: dto.name,
      gameName: dto.gameName,
      discordName: dto.discordName,
      timezone: dto.timezone,
      teamId,
      experience: dto.experience,
      droppedBefore: dto.droppedBefore,
      droppedWhy: dto.droppedWhy,
      confirmed: dto.confirm,
    });

    await this.notifySignup(tournament, dto);

    return {
      message: "Sign up successful.",
      userId: leagueCoach._id.toString(),
      tournamentId: tournament.id,
    };
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
      return teams.map((team) => ({
        id: team.coach._id.toString(),
        teamId: team._id.toString(),
        teamName: team.teamName,
        coachName: team.coach.name,
        logo: team.logo,
        status: team.status,
      }));
    }

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    const draftIdToKey = new Map(
      drafts.map((d) => [d._id.toString(), d.slug]),
    );

    const tierList = await this.tierListRepo.findById(tournament.tierListId);
    const populatedTournament = Object.assign(tournament, {
      tierList,
    }) as PopulatedTournament;

    const { guildId, coachRoleId } = tournament.discordSettings ?? {};

    const signups = await Promise.all(
      teams.map(async (team) => {
        const coach = team.coach;
        const draft = team.draftId
          ? draftIdToKey.get(team.draftId.toString())
          : undefined;
        const member = guildId
          ? await this.discordService.findMember(guildId, coach.discordName)
          : null;
        const inDiscordServer = Boolean(member);
        const hasDiscordRole = Boolean(
          coachRoleId && member?.roleIds.includes(coachRoleId),
        );
        const hasValidTeam = await isTeamRosterValid(populatedTournament, team);
        return {
          id: coach._id.toString(),
          teamId: team._id.toString(),
          name: coach.name,
          gameName: coach.gameName,
          discordName: coach.discordName,
          timezone: coach.timezone,
          experience: coach.experience,
          dropped: coach.droppedBefore ? coach.droppedWhy : undefined,
          status: team.status,
          teamName: team.teamName,
          signedUpAt: coach.signedUpAt,
          logo:
            team.logo && this.s3Service.isEnabled()
              ? this.s3Service.getPublicUrl(team.logo)
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

  /** Bulk assign/move/remove coaches across drafts. Replaces the old POST /signup/manage. */
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

    for (const assignment of assignments) {
      if (!Types.ObjectId.isValid(assignment.coachId)) continue;
      const coach = await this.coachRepo
        .findById(assignment.coachId)
        .catch(() => null);
      if (!coach) continue;

      const team = await this.teamRepo.findByIdOrNull(coach.teamId);
      if (!team || team.tournamentId.toString() !== tournament.id) continue;

      if (!assignment.divisionKey) {
        await this.teamRepo.update(team._id, {
          draftId: null,
          status: assignment.status,
        });
        continue;
      }

      const targetDraft = draftsByKey.get(assignment.divisionKey);
      if (!targetDraft)
        throw new PDZError(ErrorCodes.DRAFT.NOT_IN_LEAGUE, {
          draftSlug: assignment.divisionKey,
          tournamentSlug: tournament.slug,
        });

      await this.teamRepo.update(team._id, {
        draftId: targetDraft._id,
        status: assignment.status,
      });
    }

    return { message: "Update successful." };
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

  async setCoachLogo(
    leagueSlug: string,
    tournamentSlug: string,
    coachId: string,
    sub: string,
    dto: UpdateCoachLogoDto,
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

    const isOrganizer = tournament.isOrganizer(sub);
    const isSelf = isOwnedBy(coach, sub);
    if (!isOrganizer && !isSelf) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

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
    const tierList = await this.tierListRepo.findById(targetTierListId);

    const targetFormat = getFormat(dto.format ?? tournament.format.name);
    const targetRuleset = getRuleset(dto.ruleset ?? tournament.ruleset.name);

    if (targetFormat.name !== tierList.format.name) {
      throw new PDZError(ErrorCodes.TOURNAMENT.FORMAT_MISMATCH, {
        tournamentFormat: targetFormat.name,
        tierListFormat: tierList.format.name,
      });
    }
    if (targetRuleset.name !== tierList.ruleset.name) {
      throw new PDZError(ErrorCodes.TOURNAMENT.RULESET_MISMATCH, {
        tournamentRuleset: targetRuleset.name,
        tierListRuleset: tierList.ruleset.name,
      });
    }

    const effectiveMax = dto.draftCount?.max ?? tournament.draftCount.max;
    if (dto.tierRequirements) {
      const tierNames = new Set(tierList.tiers.map((tier) => tier.name));
      const unknownTier = dto.tierRequirements.find(
        (req) => !tierNames.has(req.tierName),
      );
      if (unknownTier) {
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: `Tier "${unknownTier.tierName}" does not exist on this tier list`,
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
    if (dto.discordSettings !== undefined)
      update["discordSettings"] = dto.discordSettings;
    if (dto.forfeit !== undefined) update["forfeit"] = dto.forfeit;
    if (dto.diffMode !== undefined) update["diffMode"] = dto.diffMode;
    if (dto.tierListId !== undefined) {
      if (!Types.ObjectId.isValid(dto.tierListId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          tierListId: dto.tierListId,
        });
      update["tierList"] = new Types.ObjectId(dto.tierListId);
    }
    if (dto.format !== undefined) update["format"] = targetFormat.name;
    if (dto.ruleset !== undefined) update["ruleset"] = targetRuleset.name;
    if (dto.draftCount !== undefined) update["draftCount"] = dto.draftCount;
    if (dto.pointTotal !== undefined) update["pointTotal"] = dto.pointTotal;
    if (dto.tierRequirements !== undefined)
      update["tierRequirements"] = dto.tierRequirements;
    if (dto.adSettings !== undefined) update["adSettings"] = dto.adSettings;

    await this.tournamentRepo.updateSettings(tournament.id, update);
    return { success: true };
  }

  private async notifySignup(tournament: HostedTournament, dto: SignUpDto) {
    try {
      const { guildId, coachRoleId, signUpChannelId } =
        tournament.discordSettings ?? {};

      const discordName = dto.discordName?.trim();
      if (discordName && guildId && coachRoleId) {
        const member = await this.discordService.findMember(
          guildId,
          discordName,
        );
        if (member) {
          await this.discordService.grantRole(guildId, member.id, coachRoleId);
        }
      }

      if (!signUpChannelId) return;

      const totalCoaches = await this.teamRepo.countByTournament(tournament.id);

      const clamp = (value: string, limit: number) =>
        value.length > limit ? `${value.slice(0, limit - 3)}...` : value;

      const embed = new EmbedBuilder()
        .setTitle(clamp(dto.name, 256))
        .setColor("#2F80ED")
        .setTimestamp(new Date())
        .addFields(
          { name: "Team Name", value: dto.teamName, inline: true },
          { name: "In-Game Name", value: dto.gameName, inline: true },
          { name: "Discord Name", value: dto.discordName, inline: true },
          { name: "Timezone", value: dto.timezone, inline: true },
          {
            name: "Experience",
            value: clamp(dto.experience, 1024),
            inline: false,
          },
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
