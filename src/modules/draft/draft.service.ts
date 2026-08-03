import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { getName } from "@modules/data/domain/pokedex";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { getTeamCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { StageDocument } from "@modules/stage/stage.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { getLatestRoster, getRosterByRound } from "../stage/domain/roster";
import {
  rosterContext,
  tournamentRosterContext,
  usesTournamentAxis,
} from "../stage/domain/stage-axis";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  PopulatedStageMatchup,
} from "../stage/domain/standings";
import { DraftEngineService } from "./draft-engine.service";
import { getDraftOrder } from "./domain/pick-order";
import { getDraftDetails, isCoach } from "./domain/team-summary";
import {
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

  private isOrganizer(tournament: PopulatedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: PopulatedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  /**
   * Resolves the Stage to use for the mixed (roster + record) views.
   * - `stageId` explicit: resolve it directly.
   * - omitted: auto-resolve if the tournament has exactly one Stage; return
   *   undefined (roster-only) if it has zero; throw if it has more than one
   *   (organizer must disambiguate via `?stageId=`).
   */
  /**
   * The stage the draft's mixed roster/record views are read against.
   *
   * Several stages per tournament is the normal shape now — a group phase and
   * a playoff bracket are two of them — so this no longer refuses to choose.
   * It only ever supplies the round axis and the trade context for the roster
   * walk, and once a tournament owns its rounds and trades every stage gives
   * the same answer. `stageId` still wins when the caller names one.
   */
  private async resolveStage(
    tournamentId: Types.ObjectId,
    stageId?: string,
  ): Promise<StageDocument | undefined> {
    if (stageId) return this.stageRepo.findById(stageId);

    const stages = await this.stageRepo.findAllByTournament(tournamentId);
    return stages[0];
  }

  /** Composes `.teams` onto a Stage the same way DraftRepository does for Draft. */
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
    // `teams` is composed in memory (not a real Draft schema path), so each
    // team document is populated individually rather than via
    // draft.populate("teams.pickLog.picker").
    await Promise.all(
      draft.teams.map((team) => team.populate("pickLog.picker")),
    );

    const allPicks = await Promise.all(
      draft.teams.map(async (team: PopulatedTeam) => {
        const picks = await Promise.all(
          team.pickLog.map(async (pickItem) => {
            const pokemonData = tournament.tierList.pokemon.get(
              pickItem.pokemon.id,
            );
            const tier = tournament.tierList.tiers.find(
              (t) => t.name === pokemonData?.tier,
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
    const teams = await Promise.all(
      draft.teams.map(async (team: PopulatedTeam, index) => {
        const teamRaw = team.pickLog.map((pickItem) => ({
          id: pickItem.pokemon.id,
        }));
        const draftTeam = teamRaw.map(
          (pokemon) => new PDZPokemon(pokemon, ruleset),
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

  /** A team's own coach, or a tournament organizer/owner overriding for them, may draft. */
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

    const isOrganizerOverride = this.isOrganizer(tournament, sub);
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
      await this.autoDraftFromQueueIfOnClock(tournament, draft, team, dto.picks);
    }

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  /**
   * `updatePicks()` is a raw $set that bypasses the in-memory team documents,
   * so the copy sitting in `draft.teams` (which draftPokemon() operates on)
   * needs the same picks before checking whether that team is now on the
   * clock with a usable queued pick.
   */
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

  /** Organizer-only edit of one turn's pick; see DraftEngineService.setPickAtRound. */
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
    this.assertOrganizer(tournament, sub);

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

    if (!this.isOrganizer(tournament, sub) && !(await isCoach(team, sub)))
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
    this.assertOrganizer(tournament, sub);

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
    this.assertOrganizer(tournament, sub);

    await this.draftEngine.setNoTimer(tournament, draft, dto.noTimer);
    return { message: "Timer mode updated successfully." };
  }

  /** Organizer-only; see DraftEngineService.updateSettings. */
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
    this.assertOrganizer(tournament, sub);

    await this.draftEngine.updateSettings(tournament, draft, dto);

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  /** Organizer-only; see DraftEngineService.sendTestMessage. */
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
    this.assertOrganizer(tournament, sub);

    if (!draft.channelId)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "No channel ID is set for this draft.",
      });

    const success = await this.draftEngine.sendTestMessage(tournament, draft);
    return { success };
  }

  /** Organizer-only; see DraftEngineService.setDraftOrder. */
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
    this.assertOrganizer(tournament, sub);

    await this.draftEngine.setDraftOrder(tournament, draft, dto);

    const { tournament: freshTournament, draft: freshDraft } =
      await this.loadContext(leagueSlug, tournamentSlug, draftSlug);
    return getDraftDetails(freshTournament, freshDraft, sub);
  }

  /** Organizer-only rewind; see DraftEngineService.setCurrentPick. */
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
    this.assertOrganizer(tournament, sub);

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

    const isOrganizerOverride = this.isOrganizer(tournament, sub);
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
    this.assertOrganizer(tournament, sub);

    await this.draftEngine.skipCurrentPick(tournament, draft);
    return { message: "Skip successful." };
  }

  /**
   * Mixed view: roster is a pure draft concern, but each team's W/L record
   * needs a Stage. If `stageId` is omitted, auto-resolves to the tournament's
   * single Stage (if exactly one exists); returns roster-only data with no
   * `record` field if zero Stages exist; throws if more than one exists.
   */
  async getTeams(
    leagueSlug: string,
    tournamentSlug: string,
    draftSlug: string,
    sub: string,
    stageId?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );

    const stageDoc = await this.resolveStage(draft.tournamentId, stageId);

    const approvedTeams = getDraftOrder(draft).filter(
      (team) => team.status === "approved",
    );

    // Rosters no longer need a stage: trades and the rounds they take effect
    // in belong to the tournament. A stage is only consulted for a tournament
    // the sections-to-stages migration has not reached, which still keeps its
    // trades on the stage.
    const roster = usesTournamentAxis(tournament)
      ? tournamentRosterContext(tournament)
      : stageDoc
        ? rosterContext(stageDoc, tournament)
        : undefined;

    if (!stageDoc) {
      const teams = approvedTeams.map((team) => ({
        id: team._id.toString(),
        coach: team.coach.name,
        logo: team.logo,
        draft: getLatestRoster(team, roster).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
          draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
        })),
        name: team.teamName,
        isCoach: team.coach.auth0Id === sub,
        timezone: team.coach.timezone,
      }));
      return { teams };
    }

    const stage = await this.composeStageTeams(stageDoc);

    // Across every stage, not just the one supplying the axis: a coach's
    // record on the draft page covers the whole tournament, and a stage is no
    // longer the unit a season is played in. Hidden stages are excluded for
    // everyone but an organizer — a result from an unreleased bracket would
    // otherwise show up in the records here.
    const canSeeHidden = this.isOrganizer(tournament, sub);
    const stages = (
      await this.stageRepo.findAllByTournament(draft.tournamentId)
    ).filter((stage) => stage.public !== false || canSeeHidden);
    const allMatchups = (await this.matchupRepo.findByStages(
      stages.map((s) => s._id),
    )) as unknown as PopulatedStageMatchup[];

    const pokemonStandings =
      await calculateDivisionPokemonStandings(allMatchups);
    const { coachStandings, diffMode } = await calculateDivisionCoachStandings(
      allMatchups,
      stage,
      tournament,
    );

    const teams = approvedTeams.map((team) => {
      const standings = coachStandings.find(
        (c) => c.id === team._id.toString(),
      );
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
        coach: team.coach.name,
        logo: team.logo,
        draft: getLatestRoster(team, roster).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
          draftFormes: tournament.tierList.getPokemonFormes(pokemon.id),
          record: pokemonStandings.find(
            (p) => p.id === pokemon.id && p.teamId === team._id.toString(),
          )?.record,
        })),
        name: team.teamName,
        isCoach: team.coach.auth0Id === sub,
        timezone: team.coach.timezone,
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
    stageId?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.resolveStage(draft.tournamentId, stageId);
    const stage = stageDoc ? await this.composeStageTeams(stageDoc) : undefined;

    const rawTierList = tournament.tierList;

    const drafted = draft.teams
      .map((team: PopulatedTeam) => ({
        team: {
          name: team.teamName,
          coachName: team.coach.name,
          id: team._id.toString(),
        },
        roster: getRosterByRound(
          team,
          stage && rosterContext(stage, tournament),
        ).map((pokemon) => {
          const pokemonTier = rawTierList.pokemon.get(pokemon.id);
          const tier = rawTierList.tiers.find(
            (t) => t.name === pokemonTier?.tier,
          );
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
            .filter(([, pokemon]) => pokemon.tier === tier.name)
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
