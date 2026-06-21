import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import {
  LeagueMatchupDocument,
  PokemonResultStatsEntity,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { DraftSpecie } from "../../classes/pokemon";
import { PopulatedLeagueMatchup } from "../../classes/matchup";
import {
  draftPokemon,
  getDivisionDetails,
  getDraftOrder,
  isCoach,
  makeTrade,
  setDivsionState,
  skipCurrentPick,
} from "../../services/league-services/draft-service";
import {
  getRosterByStage,
  getTeamDraft,
} from "../../services/league-services/league-service";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  calculateTeamScore,
} from "../../services/league-services/standings-service";
import { getTierList } from "../../services/tier-lists-services/tier-list-service";
import { getName } from "../../services/data-services/pokedex.service";
import { plannerCoverage } from "../../services/matchup-services/coverage.service";
import { movechart } from "../../services/matchup-services/movechart.service";
import { SummaryClass } from "../../services/matchup-services/summary.service";
import { Typechart } from "../../services/matchup-services/typechart.service";
import type { LeagueCoachDocument } from "../../models/league/coach.model";
import type { LeagueDivisionDocument } from "../../models/league/division.model";
import type {
  LeagueTeamDocument,
  PopulatedLeagueTeamDocument,
} from "../../models/league/team.model";
import {
  DraftPickDto,
  MakeTradeDto,
  SetDivisionStateDto,
  SetPicksDto,
  UpdateMatchupDto,
} from "./division.dto";
import {
  DivisionRepository,
  PopulatedDivision,
  PopulatedTeam,
  PopulatedTournament,
} from "./division.repository";

/**
 * The shared draft/standings/trade logic in services/league-services/*.ts
 * was written against the legacy Mongoose document shapes. PopulatedDivision
 * and PopulatedTeam (backed by the new Nest schemas) are structurally close
 * enough — same field names — that casting through `unknown` at the
 * boundary is safe; only the nominal Document type differs.
 */
type LegacyDivision = LeagueDivisionDocument & {
  teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
};
type LegacyMatchups = (LeagueMatchupDocument & {
  side1: { team: PopulatedLeagueTeamDocument };
  side2: { team: PopulatedLeagueTeamDocument };
})[];

@Injectable()
export class DivisionService {
  constructor(
    private readonly divisionRepo: DivisionRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  private async loadContext(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
  ) {
    const tournament = await this.divisionRepo.findTournament(
      leagueKey,
      tournamentKey,
    );
    const division = await this.divisionRepo.findDivision(
      tournament,
      divisionKey,
    );
    return { tournament, division };
  }

  private isOrganizer(tournament: PopulatedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: PopulatedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  private asLegacyDivision(division: PopulatedDivision): LegacyDivision {
    return division as unknown as LegacyDivision;
  }

  private asLegacyMatchups(
    matchups: LeagueMatchupDocument[],
  ): LegacyMatchups {
    return matchups as unknown as LegacyMatchups;
  }

  async getDetails(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    return getDivisionDetails(tournament, this.asLegacyDivision(division), sub);
  }

  async getTeams(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    const allMatchups = this.asLegacyMatchups(
      await this.matchupRepo.findByDivision(division._id),
    ) as unknown as PopulatedLeagueMatchup[];

    const pokemonStandings =
      await calculateDivisionPokemonStandings(allMatchups);
    const { coachStandings, diffMode } = await calculateDivisionCoachStandings(
      allMatchups,
      this.asLegacyDivision(division),
      tournament,
    );

    const teams = getDraftOrder(this.asLegacyDivision(division)).map(
      (team) => {
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
          draft: getRosterByStage(team, this.asLegacyDivision(division)).map(
            (pokemon) => ({
              id: pokemon.id,
              name: getName(pokemon.id),
              capt: { tera: pokemon.addons?.includes("Tera Captain") },
              cost: tournament.tierList.getPokemonCost(
                pokemon.id,
                pokemon.addons,
              ),
              record: pokemonStandings.find((p) => p.id === pokemon.id)
                ?.record,
            }),
          ),
          name: team.teamName,
          isCoach: team.coach.auth0Id === sub,
          timezone: team.coach.timezone,
          record,
          diffMode,
        };
      },
    );

    return { teams };
  }

  async getTeam(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    teamId: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    const team = await this.divisionRepo.findTeamById(teamId);

    const draft: ({ id: string; name: string; cost: number | undefined } & {
      record?: unknown;
    })[] = getTeamDraft(
      team as unknown as LeagueTeamDocument,
      this.asLegacyDivision(division),
      tournament,
    );

    const teamMatchups = this.asLegacyMatchups(
      await this.matchupRepo.findByDivision(division._id, {
        teamIds: [team._id],
      }),
    );

    const pokemonStandings = await calculateDivisionPokemonStandings(
      teamMatchups as unknown as PopulatedLeagueMatchup[],
      team._id.toString(),
    );

    pokemonStandings.forEach((pokemon) => {
      const draftPokemonEntry = draft.find((p) => p.id === pokemon.id);
      if (draftPokemonEntry) draftPokemonEntry.record = pokemon.record;
    });

    const coach = team.coach;
    const teamRecord = await calculateTeamScore(
      teamMatchups as unknown as Parameters<typeof calculateTeamScore>[0],
      division.stages as unknown as Parameters<typeof calculateTeamScore>[1],
      team as unknown as LeagueTeamDocument,
      tournament.forfeit,
    );

    return {
      name: team.teamName,
      timezone: coach.timezone,
      coach: coach.name,
      logo: team.logo,
      draft,
      matchups: teamMatchups,
      record: {
        wins: teamRecord.wins,
        losses: teamRecord.losses,
        pokemonDiff: teamRecord.pokemonDiff,
        gameDiff: teamRecord.gameDiff,
      },
    };
  }

  async getPicks(leagueKey: string, tournamentKey: string, divisionKey: string) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    // `teams` is composed in memory (not a real Division schema path), so
    // each team document is populated individually rather than via
    // division.populate("teams.draft.picker").
    await Promise.all(division.teams.map((team) => team.populate("draft.picker")));

    const allPicks = await Promise.all(
      division.teams.map(async (team: PopulatedTeam) => {
        const picks = await Promise.all(
          team.draft.map(async (draftItem) => {
            const pokemonData = tournament.tierList.pokemon.get(
              draftItem.pokemon.id,
            );
            const tier = tournament.tierList.tiers.find(
              (t) => t.name === pokemonData?.tier,
            );
            return {
              pokemon: {
                id: draftItem.pokemon.id,
                name: getName(draftItem.pokemon.id),
                tier,
                capt: { tera: draftItem.addons?.includes("Tera Captain") },
              },
              timestamp: draftItem.timestamp,
              picker:
                draftItem.picker && "auth0Id" in draftItem.picker
                  ? draftItem.picker.auth0Id
                  : undefined,
            };
          }),
        );

        return { name: team.teamName, picks, id: team._id.toString() };
      }),
    );

    return allPicks;
  }

  /**
   * One schedule view for everyone (no separate "manage" copy). Always
   * returns both the player-friendly computed score and the raw editable
   * side scores, plus the forfeit-mapped winner organizers need to PATCH
   * matchup results.
   */
  async getSchedule(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    teamId?: string | string[],
    stage?: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    const currentStageOnly = stage?.toLowerCase() === "current";
    const hasTeamFilter = teamId !== undefined;
    const teamIds = (Array.isArray(teamId) ? teamId : [teamId])
      .filter((id): id is string => Boolean(id))
      .filter((id) => isValidObjectId(id))
      .map((id) => new Types.ObjectId(id));

    const filteredStageDocs = division.stages.filter(
      (s) =>
        !currentStageOnly ||
        s._id.equals(division.stages[division.currentStage]._id),
    );

    const allMatchups = this.asLegacyMatchups(
      await this.matchupRepo.findByRoundsInDivision(
        division._id,
        filteredStageDocs.map((s) => s._id),
        hasTeamFilter ? { teamIds } : undefined,
      ),
    );

    const matchupsByStage = new Map<string, typeof allMatchups>();
    for (const matchup of allMatchups) {
      const stageKey = matchup.round!.toString();
      const bucket = matchupsByStage.get(stageKey);
      if (bucket) bucket.push(matchup);
      else matchupsByStage.set(stageKey, [matchup]);
    }

    const stages = filteredStageDocs.map((stageDoc) => {
      const stageIndex = division.stages.indexOf(stageDoc);
      const matchups = matchupsByStage.get(stageDoc._id.toString()) ?? [];
      const transformedMatchups = matchups.map((matchup) => ({
        id: matchup._id.toString(),
        team1: {
          name: matchup.side1.team.teamName,
          coach: matchup.side1.team.coach.name,
          score: matchup.forfeit
            ? matchup.winner === "side1"
              ? tournament.forfeit.gameDiff
              : 0
            : matchup.side1.score,
          logo: matchup.side1.team.logo,
          id: matchup.side1.team._id.toString(),
          draft: getRosterByStage(
            matchup.side1.team,
            this.asLegacyDivision(division),
            stageIndex,
          ).map((pokemon) => ({
            id: pokemon.id,
            capt: {
              ...(pokemon.addons?.includes("Tera Captain")
                ? { tera: true }
                : undefined),
            },
          })),
        },
        team2: {
          name: matchup.side2.team.teamName,
          coach: matchup.side2.team.coach.name,
          score: matchup.forfeit
            ? matchup.winner === "side2"
              ? tournament.forfeit.gameDiff
              : 0
            : matchup.side2.score,
          logo: matchup.side2.team.logo,
          id: matchup.side2.team._id.toString(),
          draft: getRosterByStage(
            matchup.side2.team,
            this.asLegacyDivision(division),
            stageIndex,
          ).map((pokemon) => ({
            id: pokemon.id,
            capt: {
              ...(pokemon.addons?.includes("Tera Captain")
                ? { tera: true }
                : undefined),
            },
          })),
        },
        matches: matchup.results.map((result) => ({
          link: result.replay,
          team1: {
            team: Object.fromEntries(result.side1.pokemon.entries()),
            score: result.side1.score,
            winner: result.winner === "side1",
          },
          team2: {
            team: Object.fromEntries(result.side2.pokemon.entries()),
            score: result.side2.score,
            winner: result.winner === "side2",
          },
        })),
        score: {
          team1: matchup.side1.score,
          team2: matchup.side2.score,
        },
        winner: matchup.forfeit
          ? matchup.winner === "side1"
            ? "side1ffw"
            : matchup.winner === "side2"
              ? "side2ffw"
              : "dffl"
          : matchup.winner,
      }));
      return {
        _id: stageDoc._id,
        name: stageDoc.name,
        matchups: transformedMatchups,
      };
    });

    return { stages, currentStage: division.currentStage };
  }

  async getStandings(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    const allMatchups = this.asLegacyMatchups(
      await this.matchupRepo.findByRoundsInDivision(
        division._id,
        division.stages.map((s) => s._id),
      ),
    ) as unknown as PopulatedLeagueMatchup[];

    const { coachStandings, diffMode } = await calculateDivisionCoachStandings(
      allMatchups,
      this.asLegacyDivision(division),
      tournament,
    );
    const pokemonStandings = await calculateDivisionPokemonStandings(allMatchups);

    return {
      coachStandings: {
        cutoff: 8,
        weeks: division.stages.length,
        teams: coachStandings,
        diffMode,
      },
      pokemonStandings,
    };
  }

  async getOrder(leagueKey: string, tournamentKey: string, divisionKey: string) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    const orderProgression = division.draft.orderProgression;
    const numberOfRounds = tournament.tierList.draftCount.max;
    const initialTeamOrder = division.teams;

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
        if (team.draft[round]) {
          const pokemonId = team.draft[round].pokemon.id;
          const pokemonName = getName(pokemonId);
          draftPick.pokemon = { id: pokemonId, name: pokemonName };
        }
        if (division.draft.counter === round * pickingOrder.length + index) {
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
    divisionKey: string,
  ): Promise<unknown[]> {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    const ruleset = getRuleset(tournament.tierList.ruleset);
    const teams = await Promise.all(
      division.teams.map(async (team: PopulatedTeam, index) => {
        const teamRaw = team.draft.map((draftItem) => ({
          id: draftItem.pokemon.id,
        }));
        const draft = DraftSpecie.getTeam(teamRaw, ruleset);
        const typechart = new Typechart(draft);
        const summary = new SummaryClass(draft);
        return {
          info: { name: team.teamName, index, id: team._id.toString() },
          typechart: typechart.toJson(),
          recommended: typechart.recommended(),
          summary: summary.toJson(),
          movechart: await movechart(draft, ruleset),
          coverage: await plannerCoverage(draft),
        };
      }),
    );
    return teams;
  }

  /** One trades view for everyone (no separate "manage" copy). */
  async getTrades(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    teamId?: string | string[],
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );

    await division.populate([
      { path: "trades.side1.team", populate: { path: "coach" } },
      { path: "trades.side2.team", populate: { path: "coach" } },
    ]);

    const teamIds = (Array.isArray(teamId) ? teamId : [teamId]).filter(
      (id): id is string => Boolean(id) && isValidObjectId(id),
    );

    const stages: { name: string; trades: unknown[] }[] = division.stages.map(
      (stage) => ({ name: stage.name, trades: [] }),
    );

    const asPopulatedTeam = (side: PopulatedDivision["trades"][number]["side1"]) =>
      side.team as unknown as
        | {
            _id: Types.ObjectId;
            teamName: string;
            logo?: string;
            coach: { name: string };
          }
        | undefined;

    const buildSide = (side: PopulatedDivision["trades"][number]["side1"]) => {
      const team = asPopulatedTeam(side);
      return {
        team: team
          ? {
              id: team._id.toString(),
              name: team.teamName,
              coach: team.coach.name,
              logo: team.logo,
            }
          : undefined,
        pokemon: side.pokemon.map((p) => {
          const cost = tournament.tierList.getPokemonCost(p.id);
          return {
            id: p.id,
            name: getName(p.id),
            cost: cost || 0,
            tera: p.addons?.includes("Tera Captain") || false,
          };
        }),
      };
    };

    for (const trade of division.trades) {
      if (trade.activeStage < 0 || trade.activeStage >= stages.length)
        continue;

      if (
        teamId &&
        !teamIds.includes(asPopulatedTeam(trade.side1)?._id.toString() ?? "") &&
        !teamIds.includes(asPopulatedTeam(trade.side2)?._id.toString() ?? "")
      )
        continue;

      stages[trade.activeStage].trades.push({
        side1: buildSide(trade.side1),
        side2: buildSide(trade.side2),
        activeStage: trade.activeStage,
        timestamp: trade.timestamp,
        status: trade.status,
      });
    }

    return { stages };
  }

  /** A team's own coach, or a tournament organizer/owner overriding for them, may draft. */
  async draftPick(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    teamId: string,
    sub: string,
    dto: DraftPickDto,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    const team = await this.divisionRepo.findTeamInDivisionOrThrow(
      division,
      teamId,
    );

    const legacyTeam = team as unknown as LeagueTeamDocument & {
      coach: LeagueCoachDocument;
    };
    if (
      !this.isOrganizer(tournament, sub) &&
      !(await isCoach(legacyTeam, sub))
    )
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
        reason: "User is not a coach on this team or a tournament organizer",
      });

    await draftPokemon(
      tournament,
      this.asLegacyDivision(division),
      legacyTeam,
      dto,
    );
    return { message: "Drafted successfully." };
  }

  async setPicks(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    teamId: string,
    sub: string,
    dto: SetPicksDto,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    const team = await this.divisionRepo.findTeamInDivisionOrThrow(
      division,
      teamId,
    );

    if (
      !this.isOrganizer(tournament, sub) &&
      !(await isCoach(
        team as unknown as LeagueTeamDocument & { coach: LeagueCoachDocument },
        sub,
      ))
    )
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
    divisionKey: string,
    sub: string,
    dto: SetDivisionStateDto,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    this.assertOrganizer(tournament, sub);

    await setDivsionState(tournament, this.asLegacyDivision(division), dto.state);
    return { message: "Timer set successfully." };
  }

  async skipPick(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    this.assertOrganizer(tournament, sub);

    await skipCurrentPick(tournament, this.asLegacyDivision(division));
    return { message: "Skip successful." };
  }

  async updateMatchup(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
    matchupId: string,
    dto: UpdateMatchupDto,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    this.assertOrganizer(tournament, sub);

    if (!isValidObjectId(matchupId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Invalid matchup ID",
      });

    const matchup = await this.matchupRepo.findByIdInDivision(
      matchupId,
      division._id,
    );

    matchup.results = dto.matches.map((match) => ({
      replay: match.link?.trim() || undefined,
      winner: match.winner,
      side1: {
        score: match.team1.score,
        pokemon: new Map(
          Object.entries(match.team1.pokemon).filter(
            ([, stats]) => stats.status !== null && stats.status !== undefined,
          ) as [string, PokemonResultStatsEntity][],
        ),
      },
      side2: {
        score: match.team2.score,
        pokemon: new Map(
          Object.entries(match.team2.pokemon).filter(
            ([, stats]) => stats.status !== null && stats.status !== undefined,
          ) as [string, PokemonResultStatsEntity][],
        ),
      },
    }));

    if (dto.score) {
      matchup.side1.score = dto.score.team1;
      matchup.side2.score = dto.score.team2;
    }

    if (dto.winner) {
      if (
        dto.winner === "side1" ||
        dto.winner === "side2" ||
        dto.winner === "draw"
      ) {
        matchup.winner = dto.winner;
      } else if (dto.winner === "side1ffw") {
        matchup.winner = "side1";
        matchup.forfeit = true;
      } else if (dto.winner === "side2ffw") {
        matchup.winner = "side2";
        matchup.forfeit = true;
      } else if (dto.winner === "dffl") {
        matchup.winner = "draw";
        matchup.forfeit = true;
      }
    }

    await matchup.save();
    return { message: "Schedule updated." };
  }

  async createTrade(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
    dto: MakeTradeDto,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    this.assertOrganizer(tournament, sub);

    if (dto.side1.team && !isValidObjectId(dto.side1.team))
      throw new PDZError(ErrorCodes.DIVISION.INVALID_TRADE, {
        reason: "Invalid team ID for side1",
      });
    if (dto.side2.team && !isValidObjectId(dto.side2.team))
      throw new PDZError(ErrorCodes.DIVISION.INVALID_TRADE, {
        reason: "Invalid team ID for side2",
      });

    const side1Trade = {
      team: dto.side1.team ? new Types.ObjectId(dto.side1.team) : undefined,
      pokemon: dto.side1.pokemon.map((p) => ({
        id: p.id,
        addons: p.tera ? ["Tera Captain"] : undefined,
      })),
    };
    const side2Trade = {
      team: dto.side2.team ? new Types.ObjectId(dto.side2.team) : undefined,
      pokemon: dto.side2.pokemon.map((p) => ({
        id: p.id,
        addons: p.tera ? ["Tera Captain"] : undefined,
      })),
    };

    await makeTrade(
      this.asLegacyDivision(division),
      side1Trade,
      side2Trade,
      dto.stage,
    );
    return { message: "Trade processed successfully." };
  }

  async getPokemonList(
    leagueKey: string,
    tournamentKey: string,
    divisionKey: string,
    sub: string,
  ) {
    const { tournament, division } = await this.loadContext(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
    this.assertOrganizer(tournament, sub);

    const rawTierList = tournament.tierList;
    const tierList = await getTierList(tournament.tierList._id);

    const drafted = division.teams
      .map((team: PopulatedTeam) => ({
        team: {
          name: team.teamName,
          coachName: team.coach.name,
          id: team._id.toString(),
        },
        roster: getRosterByStage(
          team as unknown as LeagueTeamDocument,
          this.asLegacyDivision(division),
          division.currentStage,
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
          };
        }),
      }))
      .filter((team) => team.roster.length > 0);

    const undrafted = {
      roster: tierList
        .filter((tier) => tier.cost)
        .flatMap((tier) =>
          tier.pokemon
            .filter(
              (pokemon) =>
                !drafted.some((team) =>
                  team.roster.some((p) => p.id === pokemon.id),
                ),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              cost: tier.cost,
              addons: p.addons,
            })),
        ),
    };

    const groups = [undrafted, ...drafted];
    return {
      groups,
      stages: division.stages.map((s) => s.name),
      currentStage: division.currentStage,
    };
  }
}
