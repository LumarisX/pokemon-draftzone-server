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
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder } from "discord.js";
import { Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
import { buildBracketView } from "@modules/stage/domain/bracket-view";
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
    leagueKey: string,
    tournamentKey: string,
    teamId: string,
    stageId?: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueKey,
      tournamentKey,
    );
    const team = await this.teamRepo.findById(teamId);

    const stageDoc = await this.resolveStage(tournament.id, stageId);
    const coach = team.coach;

    if (!stageDoc) {
      const roster = getRosterByRound(team, undefined).map((pokemon) => ({
        id: pokemon.id,
        name: getName(pokemon.id),
        cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
        draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
      }));
      return {
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
    } & { record?: unknown })[] = getRosterByRound(team, stage).map(
      (pokemon) => ({
        id: pokemon.id,
        name: getName(pokemon.id),
        cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
        draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
      }),
    );

    const teamMatchups = (await this.matchupRepo.findByStage(stage._id, {
      teamIds: [team._id],
    })) as unknown as PopulatedStageMatchup[];

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
      stage.rounds,
      team,
      tournament.forfeit,
    );

    return {
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

  async getTournament(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    return HostedTournamentMapper.toClientPayload(tournament);
  }

  async getInfo(leagueKey: string, tournamentKey: string, sub?: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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
      tournamentKey: tournament.tournamentKey,
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
        draftKey: draft.draftKey,
        name: draft.name,
      })),
      discord: tournament.discord,
      tierListId: tournament.tierListId,
      draftCount: tournament.draftCount,
      pointTotal: tournament.pointTotal,
    };
  }

  /** Flat team list for organizer tooling (e.g. picking bracket participants). */
  async listTeams(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    const teams = await this.teamRepo.findAllByTournament(tournament.id);
    return {
      teams: teams.map((team) => ({
        id: team._id.toString(),
        teamName: team.teamName,
        coachName: team.coach.name,
        logo: team.logo,
        pickCount: team.pickLog?.length ?? 0,
        status: team.status,
      })),
    };
  }

  async getBracket(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    const playoffsStage = tournament.getPlayoffsStage();

    if (!playoffsStage) {
      return { format: null, seeding: null, teams: [], rounds: [], matches: [] };
    }

    const bracketMatchups = await this.matchupRepo.findByRounds(
      playoffsStage.rounds.map((round) => round._id.toString()),
    );
    const teamObjIds = playoffsStage.pools.flatMap((pool) => pool.teamIds);
    const teamDocs =
      teamObjIds.length > 0 ? await this.teamRepo.findManyByIds(teamObjIds) : [];

    return buildBracketView(playoffsStage, bracketMatchups, teamDocs);
  }

  async getRoles(
    leagueKey: string,
    tournamentKey: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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

  async getSignup(leagueKey: string, tournamentKey: string, sub: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );

    const signup = await this.findSignupForTournament(sub, tournament.id);
    if (!signup)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, {
        tournamentId: tournament.id,
      });
    const { coach, team } = signup;

    let draft: { draftKey: string; name: string } | null = null;
    if (team.draftId) {
      const d = await this.draftRepo.findById(team.draftId);
      if (d) draft = { draftKey: d.draftKey, name: d.name };
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
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    dto: SignUpDto,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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

    const draft = await this.draftRepo.findOldestByTournament(tournament.id);
    if (!draft) {
      throw new PDZError(ErrorCodes.DRAFT.NOT_CONFIGURED, {
        tournamentId: tournament.id,
      });
    }

    const coachId = new Types.ObjectId();
    const teamId = new Types.ObjectId();

    await this.teamRepo.create({
      _id: teamId,
      tournamentId: tournament.id,
      draftId: draft._id,
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
    leagueKey: string,
    tournamentKey: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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

    const draftIds = teams
      .filter((team) => team.draftId)
      .map((team) => team.draftId!);
    const drafts = await this.draftRepo.findManyByIds(draftIds);
    const draftIdToKey = new Map(
      drafts.map((d) => [d._id.toString(), d.draftKey]),
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
        draftKey: d.draftKey,
        name: d.name,
      })),
    };
  }

  /** Bulk assign/move/remove coaches across drafts. Replaces the old POST /signup/manage. */
  async assignCoaches(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    assignments: CoachAssignmentDto[],
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    const draftsByKey = new Map(drafts.map((d) => [d.draftKey, d]));

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
          draftKey: assignment.divisionKey,
          tournamentKey: tournament.tournamentKey,
        });

      await this.teamRepo.update(team._id, {
        draftId: targetDraft._id,
        status: assignment.status,
      });
    }

    return { message: "Update successful." };
  }

  async getCoach(leagueKey: string, tournamentKey: string, coachId: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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
    leagueKey: string,
    tournamentKey: string,
    coachId: string,
    sub: string,
    dto: UpdateCoachLogoDto,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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

  async getRules(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    return tournament.rules;
  }

  async updateRules(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    ruleSections: RuleSectionDto[],
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }

    const rules = ruleSections.map(
      (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
    );
    await this.tournamentRepo.updateRules(tournamentKey, rules);
    return { message: "Rules updated successfully" };
  }

  async getSettings(
    leagueKey: string,
    tournamentKey: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }
    return HostedTournamentMapper.toSettingsPayload(tournament);
  }

  async updateSettings(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    dto: UpdateHostedTournamentSettingsDto,
  ) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
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
