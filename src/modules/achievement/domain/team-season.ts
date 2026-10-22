import { GamePokemon, TeamGame, TeamMatch, TeamSeason } from "./achievement";

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];

type PokemonStats = {
  status?: string;
  kills?: { direct?: number; indirect?: number };
};

type PokemonEntries =
  | Map<string, PokemonStats>
  | Record<string, PokemonStats>
  | undefined;

export type SeasonMatchup = {
  _id: { toString(): string };
  side1: { team?: { _id?: { toString(): string } } | { toString(): string } | null };
  side2: { team?: { _id?: { toString(): string } } | { toString(): string } | null };
  winner?: "side1" | "side2" | "draw" | null;
  forfeit?: boolean | null;
  scheduledDate?: Date | null;
  updatedAt?: Date | null;
  report?: { submittedAt?: Date | null } | null;
  results?: {
    winner: "side1" | "side2" | "draw";
    side1?: { pokemon?: PokemonEntries };
    side2?: { pokemon?: PokemonEntries };
  }[];
};

export type SeasonTrade = {
  status?: string;
  timestamp?: Date | null;
  side1?: { team?: { toString(): string } | null };
  side2?: { team?: { toString(): string } | null };
};

function teamId(
  team: SeasonMatchup["side1"]["team"],
): string | null {
  if (!team) return null;
  const withId = team as { _id?: { toString(): string } };
  return (withId._id ?? team).toString();
}

function entries(pokemon: PokemonEntries): [string, PokemonStats][] {
  if (!pokemon) return [];
  return pokemon instanceof Map ? [...pokemon.entries()] : Object.entries(pokemon);
}

function gamePokemon(pokemon: PokemonEntries): GamePokemon[] {
  return entries(pokemon)
    .filter(([, stats]) => !!stats?.status)
    .map(([id, stats]) => ({
      id,
      kills: (stats.kills?.direct ?? 0) + (stats.kills?.indirect ?? 0),
      fainted: stats.status === "fainted",
    }));
}

function matchDate(matchup: SeasonMatchup): Date | null {
  return (
    matchup.report?.submittedAt ??
    matchup.scheduledDate ??
    matchup.updatedAt ??
    null
  );
}

function byDate(a: { at: Date | null }, b: { at: Date | null }): number {
  const left = a.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const right = b.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return left - right;
}

export function buildTeamSeasons(input: {
  teamIds: readonly string[];
  matchups: readonly SeasonMatchup[];
  trades: readonly SeasonTrade[];
  championId: string | null;
}): Map<string, TeamSeason> {
  const seasons = new Map<string, TeamSeason>(
    input.teamIds.map((id) => [
      id,
      { teamId: id, matches: [], trades: [], champion: null },
    ]),
  );

  for (const matchup of input.matchups) {
    if (!matchup.winner) continue;
    const at = matchDate(matchup);
    for (const side of SIDES) {
      const id = teamId(matchup[side].team);
      const season = id ? seasons.get(id) : undefined;
      if (!season) continue;
      const other: Side = side === "side1" ? "side2" : "side1";
      const games: TeamGame[] = (matchup.results ?? []).map((result) => ({
        won: result.winner === side,
        lost: result.winner === other,
        pokemon: gamePokemon(result[side]?.pokemon),
      }));
      const match: TeamMatch = {
        matchupId: matchup._id.toString(),
        at,
        outcome:
          matchup.winner === side ? "w" : matchup.winner === "draw" ? "d" : "l",
        forfeit: matchup.forfeit === true,
        games,
      };
      season.matches.push(match);
    }
  }

  for (const trade of input.trades) {
    if (trade.status && trade.status !== "APPROVED") continue;
    for (const side of SIDES) {
      const id = trade[side]?.team?.toString();
      const season = id ? seasons.get(id) : undefined;
      season?.trades.push({ at: trade.timestamp ?? null });
    }
  }

  for (const season of seasons.values()) {
    season.matches.sort(byDate);
    season.trades.sort(byDate);
    if (season.teamId === input.championId) {
      const last = season.matches.at(-1);
      season.champion = { at: last?.at ?? null };
    }
  }

  return seasons;
}
