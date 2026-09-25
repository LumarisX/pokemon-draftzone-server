import { LeagueMatchupDocument } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";

export const TIEBREAKERS = [
  "headToHead",
  "gameDiff",
  "pokemonDiff",
  "strengthOfSchedule",
] as const;

export type Tiebreaker = (typeof TIEBREAKERS)[number];

export type DiffMode = "pokemon" | "game";

export type PointsTable = { win: number; draw: number; loss: number };

export type StandingsRules = {
  points: PointsTable;
  tiebreakers: Tiebreaker[];
};

export type StoredStandingsRules = {
  points?: Partial<PointsTable>;
  tiebreakers?: Tiebreaker[];
};

export const DEFAULT_POINTS: PointsTable = { win: 3, draw: 1, loss: 0 };

export type ForfeitConfig = { gameDiff: number; pokemonDiff: number };

export type MatchOutcome = "w" | "d" | "l" | "ff";

export type SideResult = {
  outcome: MatchOutcome;
  gameDiff: number;
  pokemonDiff: number;
};

type Side = "side1" | "side2";

type ScoredMatchup = Pick<
  LeagueMatchupDocument,
  "winner" | "forfeit" | "results" | "side1" | "side2"
>;

export function defaultTiebreakers(diffMode: DiffMode): Tiebreaker[] {
  return diffMode === "game"
    ? ["gameDiff", "pokemonDiff", "headToHead"]
    : ["pokemonDiff", "gameDiff", "headToHead"];
}

export function resolveStandingsRules(tournament: {
  diffMode: DiffMode;
  standingsRules?: StoredStandingsRules;
}): StandingsRules {
  const stored = tournament.standingsRules;
  return {
    points: { ...DEFAULT_POINTS, ...(stored?.points ?? {}) },
    tiebreakers: stored?.tiebreakers?.length
      ? [...stored.tiebreakers]
      : defaultTiebreakers(tournament.diffMode),
  };
}

export function pointsFor(outcome: MatchOutcome, points: PointsTable): number {
  if (outcome === "w") return points.win;
  if (outcome === "d") return points.draw;
  return points.loss;
}

function scorePokemonDiff(matchup: ScoredMatchup, side: Side): number {
  const other: Side = side === "side1" ? "side2" : "side1";
  return (matchup.results ?? []).reduce((sum, result) => {
    if (result.winner === side) return sum + (result[side]?.score ?? 0);
    if (result.winner === other) return sum - (result[other]?.score ?? 0);
    return sum;
  }, 0);
}

export function sideResult(
  matchup: ScoredMatchup,
  side: Side,
  forfeit?: ForfeitConfig,
): SideResult | null {
  const { winner } = matchup;
  if (!winner) return null;
  const other: Side = side === "side1" ? "side2" : "side1";

  if (matchup.forfeit === true) {
    const won = winner === side;
    const sign = won ? 1 : -1;
    return {
      outcome: won ? "w" : "ff",
      gameDiff: sign * (forfeit?.gameDiff ?? 0),
      pokemonDiff: sign * (forfeit?.pokemonDiff ?? 0),
    };
  }

  return {
    outcome: winner === side ? "w" : winner === other ? "l" : "d",
    gameDiff: (matchup[side].score ?? 0) - (matchup[other].score ?? 0),
    pokemonDiff: scorePokemonDiff(matchup, side),
  };
}

export type RankableRow = {
  teamId: string;
  points: number;
  gameDiff: number;
  pokemonDiff: number;
};

export type PlayedGame = {
  teamId: string;
  opponentId: string;
  points: number;
};

export function rankStandings<T extends RankableRow>(
  rows: T[],
  games: PlayedGame[],
  tiebreakers: Tiebreaker[],
): T[] {
  const pointsByTeam = new Map(rows.map((row) => [row.teamId, row.points]));

  const valueOf = (tiebreaker: Tiebreaker | "points", group: T[]) => {
    if (tiebreaker === "points") return (row: T) => row.points;
    if (tiebreaker === "gameDiff") return (row: T) => row.gameDiff;
    if (tiebreaker === "pokemonDiff") return (row: T) => row.pokemonDiff;

    const tally = new Map<string, number>();
    if (tiebreaker === "headToHead") {
      const members = new Set(group.map((row) => row.teamId));
      for (const game of games)
        if (members.has(game.teamId) && members.has(game.opponentId))
          tally.set(game.teamId, (tally.get(game.teamId) ?? 0) + game.points);
    } else {
      for (const game of games)
        tally.set(
          game.teamId,
          (tally.get(game.teamId) ?? 0) + (pointsByTeam.get(game.opponentId) ?? 0),
        );
    }
    return (row: T) => tally.get(row.teamId) ?? 0;
  };

  const order = (group: T[], keys: (Tiebreaker | "points")[]): T[] => {
    if (group.length <= 1 || keys.length === 0) return group;
    const [key, ...rest] = keys;
    const value = valueOf(key, group);
    const sorted = [...group].sort((a, b) => value(b) - value(a));
    const ranked: T[] = [];
    for (let start = 0; start < sorted.length; ) {
      let end = start + 1;
      while (end < sorted.length && value(sorted[end]) === value(sorted[start]))
        end++;
      ranked.push(...order(sorted.slice(start, end), rest));
      start = end;
    }
    return ranked;
  };

  return order(rows, ["points", ...tiebreakers]);
}
