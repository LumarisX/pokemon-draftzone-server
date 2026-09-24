import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { getName } from "@modules/data/domain/pokedex";
import { DiscordService } from "@modules/discord/discord.service";
import { getTeamCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { canOnTeam } from "@modules/tournament/membership";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { getLatestRoster } from "../stage/domain/roster";
import { rosterContextForTournament } from "../stage/domain/stage-axis";
import {
  calculateDivisionPokemonStandings,
  calculateDivisionTeamStandings,
  PopulatedStageMatchup,
} from "../stage/domain/standings";
import { getDraftOrder, isPreDraftStatus } from "./domain/pick-order";
import { getDraftDetails, isCoach } from "./domain/team-summary";
import { DraftEngineService } from "./draft-engine.service";
import {
  CreateDraftDto,
  DraftDto,
  SetCurrentPickDto,
  SetDraftOrderDto,
  SetDraftStateDto,
  SetDraftTimerDto,
  SetPicksDto,
  SetRoundPickDto,
  UpdateDraftSettingsDto,
} from "./draft.dto";
import {
  DraftRepository,
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "./draft.repository";

@Injectable()
export class DraftService {
  constructor(
    private readonly draftRepo: DraftRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly draftEngine: DraftEngineService,
    private readonly discordService: DiscordService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async loadContext(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    const draft = await this.draftRepo.findDraft(tournament, draftSlug);
    return { tournament, draft };
  }

  private async resolveStage(
    tournamentId: Types.ObjectId,
    stageSlug?: string,
  ): Promise<StageDocument | undefined> {
    if (stageSlug) return this.stageRepo.findBySlug(stageSlug);

    const stages = await this.stageRepo.findAllByTournament(tournamentId);
    return stages[0];
  }

  private async composeStageTeams(
    stage: StageDocument,
  ): Promise<StageDocument & { teams: PopulatedTeam[] }> {
    const teamIds = this.stageRepo.teamIdsInSeedOrder(stage);
    const teams = await this.teamRepo.findManyByIds(teamIds);
    return Object.assign(stage, { teams }) as StageDocument & {
      teams: PopulatedTeam[];
    };
  }

  async getDetails(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    return getDraftDetails(tournament, draft, sub);
  }

  async getPicks(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    await Promise.all(
      draft.teams.map((team) => team.populate("pickLog.picker")),
    );

    const allPicks = await Promise.all(
      draft.teams.map(async (team: PopulatedTeam) => {
        const picks = await Promise.all(
          team.pickLog.map(async (pickItem) => {
            const tier = tournament.tierList.getPokemonTier(
              pickItem.pokemon.id,
            );
            return {
              pokemon: {
                id: pickItem.pokemon.id,
                name: getName(pickItem.pokemon.id),
                tier,
                capt: { tera: pickItem.addons?.includes("Tera Captain") },
              },
              timestamp: pickItem.timestamp,
              picker:
                pickItem.picker && "auth0Id" in pickItem.picker
                  ? (pickItem.picker as unknown as { auth0Id: string }).auth0Id
                  : undefined,
            };
          }),
        );

        return { name: team.teamName, picks, id: team._id.toString() };
      }),
    );

    return allPicks;
  }

  async getOrder(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );

    const orderProgression = draft.orderProgression;
    const numberOfRounds = tournament.draftCount.max;
    const initialTeamOrder = getDraftOrder(draft);

    type DraftPick = {
      teamName: string;
      pokemon?: { id: string; name: string };
      skipTime?: Date;
    };
    type DraftRound = DraftPick[];
    const draftRounds: DraftRound[] = [];

    for (let round = 0; round < numberOfRounds; round++) {
      const currentRound: DraftPick[] = [];
      let pickingOrder = [...initialTeamOrder];

      if (orderProgression === "snake" && round % 2 === 1) {
        pickingOrder.reverse();
      }

      for (const [index, team] of pickingOrder.entries()) {
        const draftPick: DraftPick = { teamName: team.teamName };
        if (team.pickLog[round]) {
          const pokemonId = team.pickLog[round].pokemon.id;
          const pokemonName = getName(pokemonId);
          draftPick.pokemon = { id: pokemonId, name: pokemonName };
        }
        if (draft.counter === round * pickingOrder.length + index) {
          const now = new Date();
          const thirtyMinutes = 30 * 60 * 1000;
          const randomOffsetMinutes = Math.random() * 20 - 10;
          const randomOffsetMilliseconds = randomOffsetMinutes * 60 * 1000;
          draftPick.skipTime = new Date(
            now.getTime() + thirtyMinutes + randomOffsetMilliseconds,
          );
        }
        currentRound.push(draftPick);
      }
      draftRounds.push(currentRound);
    }

    return draftRounds;
  }

  async getPowerRankings(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
  ): Promise<unknown[]> {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );

    const ruleset = tournament.tierList.ruleset;
    const roster = rosterContextForTournament(tournament);
    const teams = await Promise.all(
      draft.teams.map(async (team: PopulatedTeam, index) => {
        const draftTeam = getLatestRoster(team, roster).map(
          (pokemon) => new PDZPokemon({ id: pokemon.id }, ruleset),
        );
        const typechart = getTeamTypechart(draftTeam);
        const summary = summarizeTeam(draftTeam);
        return {
          info: { name: team.teamName, index, id: team._id.toString() },
          typechart,
          summary,
          movechart: await getTeamMoves(draftTeam),
          coverage: await getTeamCoverage(draftTeam),
        };
      }),
    );
    return teams;
  }

  async draftPick(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    teamId: string,
    sub: string,
    dto: DraftDto,
  ) {
    if (!dto.add?.length && !dto.remove?.length && dto.picks === undefined)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Must include at least one add, remove, or picks update.",
      });

    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    const isOrganizerOverride = can(tournament, sub, "manageDrafts");
    if (!isOrganizerOverride && !(await isCoach(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    if (dto.add?.length || dto.remove?.length)
      await this.draftEngine.batchDraftPokemon(
        tournament,
        draft,
        team,
        dto,
        isOrganizerOverride,
      );

    if (dto.picks !== undefined) {
      await this.teamRepo.updatePicks(team._id, dto.picks);
      await this.autoDraftFromQueueIfOnClock(
        tournament,
        draft,
        team,
        dto.picks,
      );
    }

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  private async autoDraftFromQueueIfOnClock(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    picks: PopulatedTeam["picks"],
  ) {
    const teamIndex = draft.teams.findIndex((t) => t._id.equals(team._id));
    const engineTeam = teamIndex !== -1 ? draft.teams[teamIndex] : team;
    engineTeam.picks = picks;
    await this.draftEngine.autoDraftFromQueueIfOnClock(
      tournament,
      draft,
      engineTeam,
    );
  }

  async setRoundPick(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    teamId: string,
    round: number,
    sub: string,
    dto: SetRoundPickDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    await this.draftEngine.setPickAtRound(tournament, draft, team, round, {
      pokemonId: dto.pokemonId,
      addons: dto.addons,
    });

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  async setPicks(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    teamId: string,
    sub: string,
    dto: SetPicksDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    if (!can(tournament, sub, "manageDrafts") && !(await isCoach(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    await this.teamRepo.updatePicks(team._id, dto.picks);
    await this.autoDraftFromQueueIfOnClock(tournament, draft, team, dto.picks);
    return { message: "Draft pick set successfully." };
  }

  async setState(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    dto: SetDraftStateDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    await this.draftEngine.setDraftState(tournament, draft, dto.state);
    return { message: "Timer set successfully." };
  }

  async setTimerMode(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    dto: SetDraftTimerDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    await this.draftEngine.setNoTimer(tournament, draft, dto.noTimer);
    return { message: "Timer mode updated successfully." };
  }

  async updateSettings(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    dto: UpdateDraftSettingsDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    if (dto.channelId) {
      const problems = await this.discordService.findTargetProblems({
        guildId: tournament.discordSettings?.guildId,
        channelIds: [dto.channelId],
      });
      if (problems.length)
        throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
          reason: problems.join(" "),
        });
    }

    await this.draftEngine.updateSettings(tournament, draft, dto);

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  async listPools(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    const drafts = await this.draftRepo.findAllByTournament(tournament.id);
    return {
      pools: drafts.map((draft) => ({
        draftSlug: draft.slug,
        name: draft.name,
        status: draft.status,
      })),
    };
  }

  async createPool(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: CreateDraftDto,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    const start = dto.draftStart ? new Date(dto.draftStart) : undefined;
    const end = dto.draftEnd ? new Date(dto.draftEnd) : undefined;
    if (start && end && end < start)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "This pool closes before it opens.",
      });

    const existing = await this.draftRepo.findAllByTournament(tournament.id);
    const name = dto.name.trim();
    if (existing.some((draft) => draft.name.trim() === name))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: `This tournament already has a pool called "${name}".`,
      });

    const draft = await this.draftRepo.create({
      tournamentId: tournament.id,
      name,
      public: dto.public,
      draftStart: start,
      draftEnd: end,
    });

    return { draftSlug: draft.slug, name: draft.name };
  }

  async deletePool(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    if (!isPreDraftStatus(draft.status))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason:
          "A pool can only be deleted before its draft starts. Pause and reset it first.",
      });

    const drafted = draft.teams.filter((team) => team.pickLog.length > 0);
    if (drafted.length)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: `${drafted.length} team${drafted.length === 1 ? " has" : "s have"} already made picks in this pool.`,
      });

    await this.draftEngine.cancelScheduledJobs(draft);
    await this.transactions.run(async () => {
      for (const team of draft.teams) {
        await this.teamRepo.update(team._id, { draftId: null });
      }
      await this.draftRepo.delete(draft._id);
    });

    return { success: true, unassigned: draft.teams.length };
  }

  async sendTestMessage(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    if (!draft.channelId)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "No channel ID is set for this draft.",
      });

    const success = await this.draftEngine.sendTestMessage(tournament, draft);
    return { success };
  }

  async setOrder(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    dto: SetDraftOrderDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    await this.draftEngine.setDraftOrder(tournament, draft, dto);

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  async setCurrentPick(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    dto: SetCurrentPickDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    await this.draftEngine.setCurrentPick(
      tournament,
      draft,
      dto.round,
      dto.position,
    );

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  async removeDraftPick(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    teamId: string,
    sub: string,
    pokemonId: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    const isOrganizerOverride = can(tournament, sub, "manageDrafts");
    if (!isOrganizerOverride && !(await isCoach(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    await this.draftEngine.undraftPokemon(
      tournament,
      draft,
      team,
      pokemonId,
      isOrganizerOverride,
    );

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  async skipPick(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    await this.draftEngine.skipCurrentPick(tournament, draft);
    return { message: "Skip successful." };
  }

  async getTeams(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    stageSlug?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );

    const stageDoc = await this.resolveStage(draft.tournamentId, stageSlug);

    const approvedTeams = getDraftOrder(draft).filter(
      (team) => team.status === "approved",
    );

    const roster = rosterContextForTournament(tournament, stageDoc);

    if (!stageDoc) {
      const teams = approvedTeams.map((team) => ({
        id: team._id.toString(),
        coach: team.primaryCoach.name,
        logo: team.logo,
        draft: getLatestRoster(team, roster).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
          draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
          ...(tournament.tierList.hasPokemon(pokemon.id)
            ? {}
            : { missingFromTierList: true as const }),
        })),
        name: team.teamName,
        isCoach: canOnTeam(team, sub, "draft"),
        timezone: team.primaryCoach.timezone,
      }));
      return { teams };
    }

    const stage = await this.composeStageTeams(stageDoc);

    const canSeeHidden = can(tournament, sub, "viewHidden");
    const stages = (
      await this.stageRepo.findAllByTournament(draft.tournamentId)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const allMatchups = (await this.matchupRepo.findByStages(
      stages.map((s) => s._id),
    )) as unknown as PopulatedStageMatchup[];

    const pokemonStandings =
      await calculateDivisionPokemonStandings(allMatchups);
    const { teamStandings, diffMode } = await calculateDivisionTeamStandings(
      allMatchups,
      stage,
      tournament,
    );

    const teams = approvedTeams.map((team) => {
      const standings = teamStandings.find((c) => c.id === team._id.toString());
      const record = standings
        ? {
            wins: standings.wins,
            losses: standings.losses,
            pokemonDiff: standings.pokemonDiff,
            gameDiff: standings.gameDiff,
          }
        : undefined;
      return {
        id: team._id.toString(),
        coach: team.primaryCoach.name,
        logo: team.logo,
        draft: getLatestRoster(team, roster).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
          draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
          ...(tournament.tierList.hasPokemon(pokemon.id)
            ? {}
            : { missingFromTierList: true as const }),
          record: pokemonStandings.find(
            (p) => p.id === pokemon.id && p.teamId === team._id.toString(),
          )?.record,
        })),
        name: team.teamName,
        isCoach: canOnTeam(team, sub, "draft"),
        timezone: team.primaryCoach.timezone,
        record,
        diffMode,
      };
    });

    return { teams };
  }

  async getPokemonList(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    stageSlug?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    assertCan(tournament, sub, "manageDrafts");

    const stageDoc = await this.resolveStage(draft.tournamentId, stageSlug);
    const stage = stageDoc ? await this.composeStageTeams(stageDoc) : undefined;

    const rawTierList = tournament.tierList;

    const drafted = draft.teams
      .map((team: PopulatedTeam) => ({
        team: {
          name: team.teamName,
          coachName: team.primaryCoach.name,
          id: team._id.toString(),
        },
        roster: getLatestRoster(
          team,
          rosterContextForTournament(tournament, stage),
        ).map((pokemon) => {
          const pokemonTier = rawTierList.pokemon.get(pokemon.id);
          const tier = rawTierList.getPokemonTier(pokemon.id);
          return {
            id: pokemon.id,
            name: getName(pokemon.id),
            setAddons: pokemon.addons,
            addons: pokemonTier?.addons,
            cost: tier?.cost,
            draftFormes: rawTierList.getPokemonFormes(pokemon.id),
          };
        }),
      }))
      .filter((team) => team.roster.length > 0);

    const undrafted = {
      roster: rawTierList.tiers
        .filter((tier) => tier.cost)
        .flatMap((tier) =>
          Array.from(rawTierList.pokemon.entries())
            .filter(([, pokemon]) => pokemon.tierId === tier.id)
            .filter(
              ([id]) =>
                !drafted.some((team) => team.roster.some((p) => p.id === id)),
            )
            .map(([id, pokemon]) => ({
              id,
              name: pokemon.name,
              cost: tier.cost,
              addons: pokemon.addons,
            })),
        ),
    };

    const groups = [undrafted, ...drafted];
    return {
      groups,
      ...(stage
        ? {
            stages: stage.rounds.map((r) => r.name),
            currentStage: stage.currentRoundIndex,
          }
        : {}),
    };
  }
}
