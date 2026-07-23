import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ID } from "@pkmn/data";
import {
  ExternalMatchup,
  MatchupSide,
} from "@modules/matchup/sub-modules/external-matchup/external-matchup.domain";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { PokemonResultStatsEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
import {
  BracketMatchInput,
  certifiedRandomSeedOrder,
  validateBracketStructure,
} from "./domain/bracket";
import { buildBracketView } from "./domain/bracket-view";
import { getRosterByRound } from "./domain/roster";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  hasResolvedSides,
  PopulatedStageMatchup,
} from "./domain/standings";
import {
  CreateStageDto,
  GenerateBracketDto,
  MakeTradeDto,
  SetCurrentRoundDto,
  SetStagePoolsDto,
  UpdateMatchupDto,
} from "./stage.dto";
import { StageRepository } from "./stage.repository";
import { StageDocument, StageTradeSideEntity } from "./stage.schema";

const BRACKET_STAGE_TYPES: StageDocument["type"][] = [
  "single-elimination",
  "double-elimination",
  "custom",
];

@Injectable()
export class StageService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
  ) {}

  private isOrganizer(tournament: HostedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: HostedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  private async composeStageTeams(stage: StageDocument): Promise<
    StageDocument & {
      teams: Awaited<ReturnType<TeamRepository["findManyByIds"]>>;
    }
  > {
    const teamIds = this.stageRepo.flattenPoolTeamIds(stage);
    const teams = await this.teamRepo.findManyByIds(teamIds);
    return Object.assign(stage, { teams });
  }

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

    // Once a stage is certified-random and its bracket exists, pool order
    // (= the seeding) is immutable — rewriting it would let an organizer
    // fix a bracket that still displays the certified seal.
    const stageDoc = await this.stageRepo.findById(stageId);
    const latestSeeding = stageDoc.seedingLog[stageDoc.seedingLog.length - 1];
    if (
      latestSeeding?.method === "certified-random" &&
      (await this.matchupRepo.countByStage(stageDoc._id)) > 0
    ) {
      throw new PDZError(ErrorCodes.STAGE.SEEDING_LOCKED, { stageId });
    }

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

  /** Stage-scoped bracket read; tolerant of a stage with no pools/matchups yet. */
  async getBracket(stageId: string) {
    const stageDoc = await this.stageRepo.findById(stageId);
    const matchups = await this.matchupRepo.findByRounds(
      stageDoc.rounds.map((round) => round._id),
    );
    const teamObjIds = stageDoc.pools.flatMap((pool) => pool.teamIds);
    const teamDocs =
      teamObjIds.length > 0
        ? await this.teamRepo.findManyByIds(teamObjIds)
        : [];
    return buildBracketView(stageDoc, matchups, teamDocs);
  }

  /**
   * Persists a client-wired bracket in one shot: validates the match DAG,
   * assigns teams to seed numbers, writes the stage's rounds/pools/seeding
   * record, and bulk-inserts the matchups.
   *
   * Seed assignment is the integrity-sensitive step and always happens
   * here, never client-side: "certified-random" shuffles server-side with
   * a CSPRNG over the canonicalized participant list, exactly once — the
   * organizer first sees the placements after they exist. "manual" trusts
   * the submitted order but is labeled as organizer-seeded in the bracket
   * view. Every seeding is appended to the stage's permanent seedingLog.
   */
  async generateBracket(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    sub: string,
    dto: GenerateBracketDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findById(stageId);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });

    if (!BRACKET_STAGE_TYPES.includes(stageDoc.type))
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `Stage type "${stageDoc.type}" does not take a generated bracket`,
      });

    if ((await this.matchupRepo.countByStage(stageDoc._id)) > 0)
      throw new PDZError(ErrorCodes.STAGE.MATCHUPS_EXIST, { stageId });

    const teamIds = dto.teamIds;
    if (teamIds.length < 2)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "A bracket needs at least 2 teams",
      });
    if (new Set(teamIds).size !== teamIds.length)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "Duplicate team ids in participant list",
      });
    for (const teamId of teamIds) {
      if (!isValidObjectId(teamId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: `Invalid team ID "${teamId}"`,
        });
    }
    const teamDocs = await this.teamRepo.findManyByIds(
      teamIds.map((id) => new Types.ObjectId(id)),
    );
    if (teamDocs.length !== teamIds.length) {
      const found = new Set(teamDocs.map((t) => t._id.toString()));
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
        teamId: teamIds.filter((id) => !found.has(id)).join(", "),
      });
    }

    if (dto.rounds.length === 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "Bracket has no rounds",
      });
    const structureErrors = validateBracketStructure(
      dto.matches as BracketMatchInput[],
      teamIds.length,
      dto.rounds.length,
    );
    if (structureErrors.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reasons: structureErrors,
      });

    let seedOrder: string[];
    if (dto.seedingMethod === "certified-random") {
      const shuffle = certifiedRandomSeedOrder(teamIds);
      seedOrder = shuffle.seedOrder;
      stageDoc.seedingLog.push({
        method: "certified-random",
        seededAt: new Date(),
        seededBy: sub,
        inputTeamsHash: shuffle.inputTeamsHash,
        algorithmVersion: shuffle.algorithmVersion,
      });
    } else {
      seedOrder = [...teamIds];
      stageDoc.seedingLog.push({
        method: "manual",
        seededAt: new Date(),
        seededBy: sub,
      });
    }

    stageDoc.set("rounds", dto.rounds);
    stageDoc.set("pools", [
      { poolKey: "bracket", name: "Bracket", teamIds: seedOrder },
    ]);
    await stageDoc.save();

    const idByKey = new Map(
      dto.matches.map((match) => [match.key, new Types.ObjectId()]),
    );
    const toSide = (slot: BracketMatchInput["a"]) =>
      slot.type === "seed"
        ? {
            team: new Types.ObjectId(seedOrder[slot.seed - 1]),
            slot: { type: "seed" as const, seed: slot.seed },
          }
        : {
            slot: {
              type: slot.type,
              matchId: idByKey.get(slot.from)!.toString(),
            },
          };

    await this.matchupRepo.createMany(
      dto.matches.map((match) => ({
        _id: idByKey.get(match.key)!,
        stage: stageDoc._id,
        round: stageDoc.rounds[match.roundIndex]._id,
        section: match.section,
        bracketRound: match.bracketRound,
        position: match.position,
        label: match.label,
        side1: toSide(match.a as BracketMatchInput["a"]),
        side2: toSide(match.b as BracketMatchInput["b"]),
        results: [],
      })),
    );

    const seeding = stageDoc.seedingLog[stageDoc.seedingLog.length - 1];
    return {
      message: "Bracket generated.",
      seeding: {
        method: seeding.method,
        seededAt: seeding.seededAt,
        inputTeamsHash: seeding.inputTeamsHash ?? null,
        algorithmVersion: seeding.algorithmVersion ?? null,
        timesSeeded: stageDoc.seedingLog.length,
      },
      seedOrder,
      matchIds: Object.fromEntries(
        [...idByKey].map(([key, id]) => [key, id.toString()]),
      ),
    };
  }

  /**
   * Clears a stage's matchups so a bracket can be regenerated. The
   * seedingLog is intentionally left intact: a certified-random stage that
   * gets torn down and re-randomized will honestly report every seeding
   * it has ever had.
   */
  async deleteBracket(
    leagueKey: string,
    tournamentKey: string,
    stageId: string,
    sub: string,
  ) {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findById(stageId);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });

    const deleted = await this.matchupRepo.deleteByStage(stageDoc._id);
    return { message: `Deleted ${deleted} matchups.` };
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
      // Bracket matchups with unresolved winner/loser slots have no teams to
      // display yet, so they don't appear on the schedule.
      const transformedMatchups = matchups.filter(hasResolvedSides).map((matchup) => ({
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

    // A team-scoped schedule only shows rounds the team actually plays in.
    // (Safe to drop rounds here: only the unfiltered manage view indexes
    // rounds by currentRoundIndex.)
    const visibleRounds = hasTeamFilter
      ? rounds.filter((round) => round.matchups.length > 0)
      : rounds;

    return {
      rounds: visibleRounds,
      currentRoundIndex: stageDoc.currentRoundIndex,
    };
  }

  /**
   * Full analysis view (summary/speed/coverage/type/move charts) for one
   * league matchup, shaped like the external matchup breakdown payload so
   * the client's matchup overview page can render either. `sub` only
   * affects side order (a coach sees their own team first).
   */
  async getMatchupAnalysis(stageId: string, matchupId: string, sub?: string) {
    if (!isValidObjectId(matchupId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Invalid matchup ID",
        matchupId,
      });

    const stageDoc = await this.stageRepo.findById(stageId);
    const tournament = await this.hostedTournamentRepo.findById(
      stageDoc.tournamentId,
    );
    // The tier list decides which alternate formes each pick may run; a missing
    // or unresolvable tier list just means no formes are attached.
    const tierList = await this.tierListRepo
      .findById(tournament.tierListId)
      .catch(() => undefined);

    const matchupDoc = (await this.matchupRepo.findByIdInStagePopulated(
      matchupId,
      stageId,
    )) as unknown as PopulatedStageMatchup;
    // Bracket matchups with unresolved winner/loser slots have no teams to
    // analyze yet — treat them like a missing matchup.
    if (!hasResolvedSides(matchupDoc))
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupId });

    const roundIndex = matchupDoc.round
      ? stageDoc.rounds.findIndex((round) =>
          round._id.equals(matchupDoc.round!),
        )
      : -1;
    const roundDoc =
      roundIndex === -1 ? undefined : stageDoc.rounds[roundIndex];

    const toSide = (side: { team: PopulatedTeam }): MatchupSide => {
      const roster = getRosterByRound(
        side.team,
        stageDoc,
        roundIndex === -1 ? undefined : roundIndex,
      );
      const team: PDZPokemon[] = [];
      for (const pokemon of roster) {
        try {
          team.push(
            new PDZPokemon(
              {
                id: pokemon.id,
                capt: pokemon.addons?.includes("Tera Captain")
                  ? { tera: [] }
                  : undefined,
                draftFormes: tierList?.getPokemonFormeIds(pokemon.id) as
                  | ID[]
                  | undefined,
              },
              tournament.ruleset,
            ),
          );
        } catch {
          // A species that no longer resolves against the ruleset is
          // dropped from the analysis rather than failing the whole page.
        }
      }
      return {
        team,
        teamName: side.team.teamName,
        coach: side.team.coach.name,
        owner: side.team.coach.auth0Id,
      };
    };

    const matchup = new ExternalMatchup({
      ruleset: tournament.ruleset,
      format: tournament.format,
      tournamentName: tournament.name,
      stage: roundDoc?.name ?? stageDoc.name,
      gameTime: matchupDoc.scheduledDate,
      aTeam: toSide(matchupDoc.side1),
      bTeam: toSide(matchupDoc.side2),
    });
    return matchup.analyze(sub);
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

    // Bracket advancement: fill in the winner/loser side of any downstream
    // matchup that references this one, so it becomes resolvable (visible
    // on the schedule) as soon as this result is recorded.
    if (dto.winner && matchup.stage) {
      const winnerTeamId =
        matchup.winner === "side1"
          ? matchup.side1.team
          : matchup.winner === "side2"
            ? matchup.side2.team
            : undefined;
      const loserTeamId =
        matchup.winner === "side1"
          ? matchup.side2.team
          : matchup.winner === "side2"
            ? matchup.side1.team
            : undefined;

      if (winnerTeamId || loserTeamId) {
        await this.matchupRepo.resolveDownstreamSlots(
          matchup.stage,
          matchup._id,
          winnerTeamId,
          loserTeamId,
        );
      }
    }

    return { message: "Schedule updated." };
  }
}
