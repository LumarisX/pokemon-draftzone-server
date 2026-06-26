import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { PokemonResultStatsEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
import { getRosterByRound } from "./domain/roster";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  PopulatedStageMatchup,
} from "./domain/standings";
import {
  CreateStageDto,
  MakeTradeDto,
  SetCurrentRoundDto,
  SetStagePoolsDto,
  UpdateMatchupDto,
} from "./stage.dto";
import { StageRepository } from "./stage.repository";
import { StageDocument, StageTradeSideEntity } from "./stage.schema";

@Injectable()
export class StageService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
  ) {}

  private isOrganizer(tournament: HostedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: HostedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  /** Composes a Stage's `.teams` via flattenPoolTeamIds + TeamRepository, mirroring DraftRepository.findDraft. */
  private async composeStageTeams(stage: StageDocument): Promise<
    StageDocument & {
      teams: Awaited<ReturnType<TeamRepository["findManyByIds"]>>;
    }
  > {
    const teamIds = this.stageRepo.flattenPoolTeamIds(stage);
    const teams = await this.teamRepo.findManyByIds(teamIds);
    return Object.assign(stage, { teams });
  }

  /**
   * Brand-new endpoint, no DivisionController precedent. Gated the same way
   * as the other stage-mutating endpoints (organizer/owner only) since
   * creating a Stage is an organizer-level tournament-structure decision,
   * not a player action.
   */
  async createStage(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    dto: CreateStageDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    return this.stageRepo.create({
      tournamentId: tournament.id,
      order: dto.order,
      name: dto.name,
      type: dto.type as StageDocument["type"],
      rounds: dto.rounds,
    });
  }

  /** Lightweight ordered list for the client's stage switcher. */
  async listStages(leagueKey: string, tournamentKey: string) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    const stages = await this.stageRepo.findAllByTournament(tournament.id);
    return stages.map((stage) => ({
      _id: stage._id.toString(),
      name: stage.name,
      type: stage.type,
      order: stage.order,
      currentRoundIndex: stage.currentRoundIndex,
    }));
  }

  async setPools(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    sub: string,
    dto: SetStagePoolsDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    for (const pool of dto.pools) {
      for (const teamId of pool.teamIds) {
        if (!isValidObjectId(teamId))
          throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
            reason: `Invalid team ID "${teamId}" in pool "${pool.poolKey}"`,
          });
      }
    }

    return this.stageRepo.setPools(
      stageId,
      dto.pools.map((pool) => ({
        poolKey: pool.poolKey,
        name: pool.name,
        teamIds: pool.teamIds.map((id) => new Types.ObjectId(id)),
      })),
    );
  }

  async advanceCurrentRound(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    sub: string,
    dto: SetCurrentRoundDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    return this.stageRepo.setCurrentRoundIndex(stageId, dto.currentRoundIndex);
  }

  /**
   * One schedule view for everyone (no separate "manage" copy). `roundFilter`
   * mirrors the old `stage` query param's `"current"` filter, now scoped to
   * `stage.rounds[stage.currentRoundIndex]` instead of `division.stages`.
   */
  async getSchedule(
    stageId: string,
    teamId?: string | string[],
    roundFilter?: string,
  ) {
    const stageDoc = await this.stageRepo.findById(stageId);

    // forfeit.gameDiff is needed to display a forfeited match's score the
    // same way the old division.controller.ts schedule view did — resolved
    // by tournamentId for the same reason as getStandings (Stage is
    // addressed purely by `_id`).
    const tournament = await this.hostedTournamentRepo.findById(
      stageDoc.tournamentId,
    );

    const currentRoundOnly = roundFilter?.toLowerCase() === "current";
    const hasTeamFilter = teamId !== undefined;
    const teamIds = (Array.isArray(teamId) ? teamId : [teamId])
      .filter((id): id is string => Boolean(id))
      .filter((id) => isValidObjectId(id))
      .map((id) => new Types.ObjectId(id));

    const filteredRounds = stageDoc.rounds.filter(
      (r) =>
        !currentRoundOnly ||
        (stageDoc.rounds[stageDoc.currentRoundIndex] &&
          r._id.equals(stageDoc.rounds[stageDoc.currentRoundIndex]._id)),
    );

    const allMatchups = (await this.matchupRepo.findByRoundsInStage(
      stageDoc._id,
      filteredRounds.map((r) => r._id),
      hasTeamFilter ? { teamIds } : undefined,
    )) as unknown as PopulatedStageMatchup[];

    const matchupsByRound = new Map<string, PopulatedStageMatchup[]>();
    for (const matchup of allMatchups) {
      const roundKey = matchup.round!.toString();
      const bucket = matchupsByRound.get(roundKey);
      if (bucket) bucket.push(matchup);
      else matchupsByRound.set(roundKey, [matchup]);
    }

    const rounds = filteredRounds.map((roundDoc) => {
      const roundIndex = stageDoc.rounds.indexOf(roundDoc);
      const matchups = matchupsByRound.get(roundDoc._id.toString()) ?? [];
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
          draft: getRosterByRound(matchup.side1.team, stageDoc, roundIndex).map(
            (pokemon) => ({
              id: pokemon.id,
              capt: {
                ...(pokemon.addons?.includes("Tera Captain")
                  ? { tera: true }
                  : undefined),
              },
            }),
          ),
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
          draft: getRosterByRound(matchup.side2.team, stageDoc, roundIndex).map(
            (pokemon) => ({
              id: pokemon.id,
              capt: {
                ...(pokemon.addons?.includes("Tera Captain")
                  ? { tera: true }
                  : undefined),
              },
            }),
          ),
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
        _id: roundDoc._id,
        name: roundDoc.name,
        matchups: transformedMatchups,
      };
    });

    return { rounds, currentRoundIndex: stageDoc.currentRoundIndex };
  }

  async getStandings(stageId: string) {
    const stageDoc = await this.stageRepo.findById(stageId);
    const stage = await this.composeStageTeams(stageDoc);

    const tournament = await this.hostedTournamentRepo.findById(
      stage.tournamentId,
    );

    const allMatchups = (await this.matchupRepo.findByRoundsInStage(
      stage._id,
      stage.rounds.map((r) => r._id),
    )) as unknown as PopulatedStageMatchup[];

    const { coachStandings, diffMode } = await calculateDivisionCoachStandings(
      allMatchups,
      stage,
      tournament,
    );
    const pokemonStandings =
      await calculateDivisionPokemonStandings(allMatchups);

    return {
      coachStandings: {
        cutoff: 8,
        weeks: stage.rounds.length,
        teams: coachStandings,
        diffMode,
      },
      pokemonStandings,
    };
  }

  /** One trades view for everyone (no separate "manage" copy). */
  async getTrades(stageId: string, teamId?: string | string[]) {
    const stageDoc = await this.stageRepo.findById(stageId);

    await stageDoc.populate([
      { path: "trades.side1.team", populate: { path: "coach" } },
      { path: "trades.side2.team", populate: { path: "coach" } },
    ]);

    const teamIds = (Array.isArray(teamId) ? teamId : [teamId]).filter(
      (id): id is string => Boolean(id) && isValidObjectId(id),
    );

    const rounds: { name: string; trades: unknown[] }[] = stageDoc.rounds.map(
      (round) => ({ name: round.name, trades: [] }),
    );

    type TradeSide = (typeof stageDoc.trades)[number]["side1"];

    const asPopulatedTeam = (side: TradeSide) =>
      side.team as unknown as
        | {
            _id: Types.ObjectId;
            teamName: string;
            logo?: string;
            coach: { name: string };
          }
        | undefined;

    const buildSide = (side: TradeSide) => {
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
        pokemon: side.pokemon.map((p) => ({
          id: p.id,
          name: getName(p.id),
          tera: p.addons?.includes("Tera Captain") || false,
        })),
      };
    };

    for (const trade of stageDoc.trades) {
      if (trade.activeRound < 0 || trade.activeRound >= rounds.length) continue;

      if (
        teamId &&
        !teamIds.includes(asPopulatedTeam(trade.side1)?._id.toString() ?? "") &&
        !teamIds.includes(asPopulatedTeam(trade.side2)?._id.toString() ?? "")
      )
        continue;

      rounds[trade.activeRound].trades.push({
        side1: buildSide(trade.side1),
        side2: buildSide(trade.side2),
        activeRound: trade.activeRound,
        timestamp: trade.timestamp,
        status: trade.status,
      });
    }

    return { rounds };
  }

  async createTrade(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    sub: string,
    dto: MakeTradeDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findById(stageId);

    if (dto.side1.team && !isValidObjectId(dto.side1.team))
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: "Invalid team ID for side1",
      });
    if (dto.side2.team && !isValidObjectId(dto.side2.team))
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
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

    await this.makeTrade(stageDoc, side1Trade, side2Trade, dto.roundIndex);
    return { message: "Trade processed successfully." };
  }

  /**
   * Records a trade between two teams in the same Stage, validating that
   * each side's offered Pokemon actually exist on that team's current
   * roster (post any earlier trades, walked via getRosterByRound) before
   * approving it.
   */
  private async makeTrade(
    stage: StageDocument,
    side1: StageTradeSideEntity,
    side2: StageTradeSideEntity,
    activeRoundIndex: number,
  ) {
    if (side1.team === undefined && side2.team === undefined) return;

    const team1 = side1.team
      ? await this.teamRepo.findByIdOrNull(side1.team)
      : null;
    if (side1.team && !team1)
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: side1.team });

    const team2 = side2.team
      ? await this.teamRepo.findByIdOrNull(side2.team)
      : null;
    if (side2.team && !team2)
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: side2.team });

    if (team1) {
      const draftedPokemonIds = new Set(
        getRosterByRound(team1, stage).map((pokemon) => pokemon.id),
      );
      for (const pokemon of side1.pokemon) {
        if (!draftedPokemonIds.has(pokemon.id)) {
          throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
            pokemonId: pokemon.id,
            teamId: team1._id.toString(),
          });
        }
      }
    }

    if (team2) {
      const draftedPokemonIds = new Set(
        getRosterByRound(team2, stage).map((pokemon) => pokemon.id),
      );
      for (const pokemon of side2.pokemon) {
        if (!draftedPokemonIds.has(pokemon.id)) {
          throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
            pokemonId: pokemon.id,
            teamId: team2._id.toString(),
          });
        }
      }
    }

    stage.trades.push({
      side1,
      side2,
      timestamp: new Date(),
      activeRound: activeRoundIndex,
      status: "APPROVED",
    });

    await stage.save();
  }

  async updateMatchup(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    matchupId: string,
    sub: string,
    dto: UpdateMatchupDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    if (!isValidObjectId(matchupId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Invalid matchup ID",
      });

    const matchup = await this.matchupRepo.findByIdInStage(matchupId, stageId);

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
}
