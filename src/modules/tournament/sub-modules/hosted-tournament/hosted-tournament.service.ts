import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { S3Service } from "@core/storage/s3.service";
import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import { DiscordService } from "@modules/discord/discord.service";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder } from "discord.js";
import { Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
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
} from "./hosted-tournament.dto";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";

const DISCORD_GUILD_ID = "1183936734719922176";
const SIGNUP_COACH_ROLE_ID = "1469151649070186576";
const SIGNUP_CHANNEL_ID = "1303896194187132978";

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

  /**
   * Not draft-scoped — a team belongs to at most one draft within a
   * tournament, so it can be looked up by id alone. This lets undrafted
   * teams (no draftId yet) have a team page too, just with an empty
   * roster/matchups until they're assigned.
   */
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
    } & { record?: unknown })[] = getRosterByRound(team, stage).map(
      (pokemon) => ({
        id: pokemon.id,
        name: getName(pokemon.id),
        cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
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

  /**
   * Resolves the Stage to use for the mixed (roster + record) views.
   * - `stageId` explicit: resolve it directly.
   * - omitted: auto-resolve if the tournament has exactly one Stage; return
   *   undefined (roster-only) if it has zero; throw if it has more than one
   *   (organizer must disambiguate via `?stageId=`).
   */
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

  /** Composes `.teams` onto a Stage the same way DraftRepository does for Draft. */
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
    const tierList = await this.tierListRepo.findById(tournament.tierListId);

    // Members (signed-up coaches and organizers) can see every draft,
    // including ones the organizer hasn't published yet; everyone else only
    // sees drafts explicitly marked public.
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
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
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
    };
  }

  async getBracket(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    const playoffsStage = tournament.getPlayoffsStage();

    if (!playoffsStage) {
      return { format: null, teams: [], rounds: [], matches: [] };
    }

    const roundIds = playoffsStage.rounds.map((round) => round._id.toString());
    const bracketMatchups = await this.matchupRepo.findByRounds(roundIds);

    // Brackets now only ever belong to a single Stage (the resolved
    // playoffsStage), so there's no longer a need to resolve a per-matchup
    // or per-team "divisionKey" the way the old code resolved multiple
    // divisions across matchups/teams. The team list comes straight from
    // this stage's own pools.
    const teamObjIds = this.stageRepo.flattenPoolTeamIds(playoffsStage);

    const teamDocs = await this.teamRepo.findManyByIds(teamObjIds);

    const teamsArray = teamObjIds
      .map((teamId, idx) => {
        const teamDoc = teamDocs.find(
          (t) => t._id.toString() === teamId.toString(),
        );
        if (!teamDoc) return null;
        return {
          seed: idx + 1,
          teamName: teamDoc.teamName,
          coachName: teamDoc.coach.name,
          logo: teamDoc.logo,
          teamId: teamDoc._id.toString(),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const roundIdToName = new Map(
      playoffsStage.rounds.map((round) => [round._id.toString(), round.name]),
    );

    const matches = bracketMatchups.map((matchup) => ({
      _id: matchup._id.toString(),
      round: matchup.round?.toString() ?? null,
      roundName: matchup.round
        ? (roundIdToName.get(matchup.round.toString()) ?? null)
        : null,
      a: matchup.side1.slot
        ? {
            type: matchup.side1.slot.type,
            ...(matchup.side1.slot.type === "seed"
              ? { seed: matchup.side1.slot.seed }
              : { from: (matchup.side1.slot as { matchId: string }).matchId }),
          }
        : null,
      b: matchup.side2.slot
        ? {
            type: matchup.side2.slot.type,
            ...(matchup.side2.slot.type === "seed"
              ? { seed: matchup.side2.slot.seed }
              : { from: (matchup.side2.slot as { matchId: string }).matchId }),
          }
        : null,
      winner:
        matchup.winner === "side1"
          ? 0
          : matchup.winner === "side2"
            ? 1
            : undefined,
      replay: matchup.results?.[0]?.replay,
    }));

    const rounds = playoffsStage.rounds.map((round) => ({
      _id: round._id.toString(),
      name: round.name,
      matchDeadline: round.matchDeadline ?? null,
    }));

    return {
      format: playoffsStage.type,
      teams: teamsArray,
      rounds,
      matches,
    };
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

  /** Finds the coach + team belonging to `sub` within this tournament, if any. A person may have signed up for other tournaments too, each producing its own Coach/Team pair. */
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

    const member = await this.discordService.findMember(
      DISCORD_GUILD_ID,
      coach.discordName,
    );
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

    // Every tournament is expected to have exactly one draft; sign-ups
    // auto-join it instead of waiting on a manual assignCoaches() call.
    const draft = await this.draftRepo.findOldestByTournament(tournament.id);
    if (!draft) {
      throw new PDZError(ErrorCodes.DRAFT.NOT_CONFIGURED, {
        tournamentId: tournament.id,
      });
    }

    // Pre-generate both ids so Team.coach and Coach.teamId (both required)
    // can be set correctly on first insert, with neither side left dangling.
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

  /**
   * Organizers/owners get the full admin roster view (Discord membership,
   * dropped reason, draft assignment); everyone else gets the minimal
   * public-safe shape. One endpoint instead of a separate "manage" copy.
   */
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

    const signups = await Promise.all(
      teams.map(async (team) => {
        const coach = team.coach;
        const draft = team.draftId
          ? draftIdToKey.get(team.draftId.toString())
          : undefined;
        const member = await this.discordService.findMember(
          DISCORD_GUILD_ID,
          coach.discordName,
        );
        const inDiscordServer = Boolean(member);
        const hasDiscordRole = Boolean(
          member?.roleIds.includes(SIGNUP_COACH_ROLE_ID),
        );
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
        await this.teamRepo.update(team._id, { draftId: null });
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

  private async notifySignup(tournament: HostedTournament, dto: SignUpDto) {
    try {
      const discordName = dto.discordName?.trim();
      if (discordName) {
        const member = await this.discordService.findMember(
          DISCORD_GUILD_ID,
          discordName,
        );
        if (member) {
          await this.discordService.grantRole(
            DISCORD_GUILD_ID,
            member.id,
            SIGNUP_COACH_ROLE_ID,
          );
        }
      }

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

      await this.discordService.sendMessage(SIGNUP_CHANNEL_ID, {
        content: `There's a new sign up for **${tournament.name}**! Total sign ups: ${totalCoaches}`,
        embeds: [embed],
      });
    } catch (discordError) {
      this.logger.warn("Failed to send Discord notification", discordError);
    }
  }
}
