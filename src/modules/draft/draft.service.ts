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
import { getRosterByRound } from "../stage/domain/roster";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  PopulatedStageMatchup,
} from "../stage/domain/standings";
import { DraftEngineService } from "./draft-engine.service";
import { getDraftOrder } from "./domain/pick-order";
import { getDraftDetails, isCoach } from "./domain/team-summary";
import { DraftPickDto, SetDraftStateDto, SetPicksDto } from "./draft.dto";
import {
  DraftRepository,
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
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
  ) {
    const tournament = await this.draftRepo.findTournament(
      leagueKey,
      tournamentKey,
    );
    const draft = await this.draftRepo.findDraft(tournament, draftKey);
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
  private async resolveStage(
    tournamentId: Types.ObjectId,
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

  async getDetails(
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
    );
    return getDraftDetails(tournament, draft, sub);
  }

  async getPicks(leagueKey: string, tournamentKey: string, draftKey: string) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
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

  async getOrder(leagueKey: string, tournamentKey: string, draftKey: string) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
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
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
  ): Promise<unknown[]> {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
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
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    teamId: string,
    sub: string,
    dto: DraftPickDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
    );
    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    if (!this.isOrganizer(tournament, sub) && !(await isCoach(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    await this.draftEngine.draftPokemon(tournament, draft, team, dto);
    return { message: "Drafted successfully." };
  }

  async setPicks(
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    teamId: string,
    sub: string,
    dto: SetPicksDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
    );
    const team = await this.draftRepo.findTeamInDraftOrThrow(draft, teamId);

    if (!this.isOrganizer(tournament, sub) && !(await isCoach(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    team.picks = dto.picks;
    await team.save();
    return { message: "Draft pick set successfully." };
  }

  async setState(
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    sub: string,
    dto: SetDraftStateDto,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
    );
    this.assertOrganizer(tournament, sub);

    await this.draftEngine.setDraftState(tournament, draft, dto.state);
    return { message: "Timer set successfully." };
  }

  async skipPick(
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    sub: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
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
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    sub: string,
    stageId?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
    );

    const stageDoc = await this.resolveStage(draft.tournamentId, stageId);

    if (!stageDoc) {
      const teams = getDraftOrder(draft).map((team) => ({
        id: team._id.toString(),
        coach: team.coach.name,
        logo: team.logo,
        draft: getRosterByRound(team, undefined).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
        })),
        name: team.teamName,
        isCoach: team.coach.auth0Id === sub,
        timezone: team.coach.timezone,
      }));
      return { teams };
    }

    const stage = await this.composeStageTeams(stageDoc);

    const allMatchups = (await this.matchupRepo.findByStage(
      stage._id,
    )) as unknown as PopulatedStageMatchup[];

    const pokemonStandings =
      await calculateDivisionPokemonStandings(allMatchups);
    const { coachStandings, diffMode } = await calculateDivisionCoachStandings(
      allMatchups,
      stage,
      tournament,
    );

    const teams = getDraftOrder(draft).map((team) => {
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
        draft: getRosterByRound(team, stage).map((pokemon) => ({
          id: pokemon.id,
          name: getName(pokemon.id),
          capt: { tera: pokemon.addons?.includes("Tera Captain") },
          cost: tournament.tierList.getPokemonCost(pokemon.id, pokemon.addons),
          record: pokemonStandings.find((p) => p.id === pokemon.id)?.record,
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
    leagueKey: string,
    tournamentKey: string,
    draftKey: string,
    sub: string,
    stageId?: string,
  ) {
    const { tournament, draft } = await this.loadContext(
      leagueKey,
      tournamentKey,
      draftKey,
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
        roster: getRosterByRound(team, stage).map((pokemon) => {
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
