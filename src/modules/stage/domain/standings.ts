import { StageDocument } from "@modules/stage/stage.schema";
import { LeagueMatchupDocument } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PopulatedTeam } from "@modules/team/team.repository";
import { getName } from "@modules/data/domain/pokedex";
import {
  DiffMode,
  ForfeitConfig,
  MatchOutcome,
  PlayedGame,
  pointsFor,
  rankStandings,
  resolveStandingsRules,
  SideResult,
  sideResult,
  StandingsRules,
  StoredStandingsRules,
} from "./scoring";
import { AxisTournament, RoundLike } from "./stage-axis";

export type PopulatedStageMatchup = LeagueMatchupDocument & {
  side1: { team?: PopulatedTeam };
  side2: { team?: PopulatedTeam };
};

export function hasResolvedSides(
  matchup: PopulatedStageMatchup,
): matchup is PopulatedStageMatchup & {
  side1: { team: PopulatedTeam };
  side2: { team: PopulatedTeam };
} {
  return Boolean(matchup.side1.team && matchup.side2.team);
}

export async function calculateDivisionPokemonStandings(
  matchups: PopulatedStageMatchup[],
  filterTeamId?: string,
) {
  const pokemonStandingsMap = new Map<
    string,
    {
      id: string;
      name: string;
      coach: string;
      teamName: string;
      teamId: string;
      brought: number;
      kills: number;
      deaths: number;
    }
  >();

  for (const matchup of matchups) {
    if (!hasResolvedSides(matchup)) continue;
    const team1Doc = matchup.side1.team;
    const team2Doc = matchup.side2.team;
    const team1Coach = team1Doc.teamName || "Unknown Coach";
    const team2Coach = team2Doc.teamName || "Unknown Coach";
    const team1Key = team1Doc._id.toString();
    const team2Key = team2Doc._id.toString();
    if (!matchup.results) continue;
    for (const result of matchup.results) {
      if (result.side1?.pokemon) {
        for (const [pokemonId, stats] of result.side1.pokemon.entries()) {
          if (filterTeamId && team1Key !== filterTeamId) continue;
          const pokemonKey = `${pokemonId}-${team1Key}`;

          if (!pokemonStandingsMap.has(pokemonKey)) {
            pokemonStandingsMap.set(pokemonKey, {
              id: pokemonId,
              name: getName(pokemonId),
              coach: team1Coach,
              teamName: team1Doc.teamName,
              teamId: team1Key,
              brought: 0,
              kills: 0,
              deaths: 0,
            });
          }

          const pokemonStandings = pokemonStandingsMap.get(pokemonKey)!;
          if (stats.status) {
            pokemonStandings.brought += 1;
          }
          pokemonStandings.kills +=
            (stats.kills?.direct ?? 0) + (stats.kills?.indirect ?? 0);
          if (stats.status === "fainted") {
            pokemonStandings.deaths += 1;
          }
        }
      }

      if (result.side2?.pokemon) {
        for (const [pokemonId, stats] of result.side2.pokemon.entries()) {
          if (filterTeamId && team2Key !== filterTeamId) {
            continue;
          }

          const pokemonKey = `${pokemonId}-${team2Key}`;

          if (!pokemonStandingsMap.has(pokemonKey)) {
            pokemonStandingsMap.set(pokemonKey, {
              id: pokemonId,
              name: getName(pokemonId),
              coach: team2Coach,
              teamName: team2Doc.teamName,
              teamId: team2Key,
              brought: 0,
              kills: 0,
              deaths: 0,
            });
          }

          const pokemonStandings = pokemonStandingsMap.get(pokemonKey)!;
          if (stats.status) {
            pokemonStandings.brought += 1;
          }
          pokemonStandings.kills +=
            (stats.kills?.direct ?? 0) + (stats.kills?.indirect ?? 0);
          if (stats.status === "fainted") {
            pokemonStandings.deaths += 1;
          }
        }
      }
    }
  }

  return Array.from(pokemonStandingsMap.values())
    .map((pokemon) => {
      return {
        id: pokemon.id,
        name: pokemon.name,
        coach: pokemon.coach,
        teamName: pokemon.teamName,
        teamId: pokemon.teamId,
        record: {
          brought: pokemon.brought,
          kills: pokemon.kills,
          deaths: pokemon.deaths,
          diff: pokemon.kills - pokemon.deaths,
        },
      };
    })
    .sort((a, b) => {
      if (b.record.kills !== a.record.kills)
        return b.record.kills - a.record.kills;
      return b.record.diff - a.record.diff;
    });
}

export type StandingResult = {
  outcome: MatchOutcome | "t";
  score: number;
} | null;

export type ScoringTournament = {
  diffMode: DiffMode;
  forfeit?: ForfeitConfig;
  standingsRules?: StoredStandingsRules;
};

type TeamStanding = {
  name: string;
  results: StandingResult[];
  coach: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pokemonDiff: number;
  gameDiff: number;
  logo?: string;
  teamId: string;
  teamSlug: string;
};

export type TeamScore = {
  teamId: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  unplayed: number;
  streak: number;
  gameDiff: number;
  pokemonDiff: number;
  results: StandingResult[];
  diffMode: DiffMode;
};

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];

function createTeamStanding(
  team: PopulatedTeam,
  roundCount: number,
): TeamStanding {
  return {
    name: team.teamName,
    results: Array(roundCount).fill(null),
    coach: team.primaryCoach.name,
    logo: team.logo,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    pokemonDiff: 0,
    gameDiff: 0,
    teamId: team._id.toString(),
    teamSlug: team.slug,
  };
}

function applySideResult(
  standing: TeamStanding,
  roundIndex: number,
  result: SideResult,
  rules: StandingsRules,
  diffMode: DiffMode,
) {
  if (result.outcome === "w") standing.wins += 1;
  else if (result.outcome === "d") standing.draws += 1;
  else standing.losses += 1;
  standing.points += pointsFor(result.outcome, rules.points);
  standing.gameDiff += result.gameDiff;
  standing.pokemonDiff += result.pokemonDiff;
  if (roundIndex >= 0 && roundIndex < standing.results.length) {
    standing.results[roundIndex] = {
      outcome: result.outcome,
      score: diffMode === "game" ? result.gameDiff : result.pokemonDiff,
    };
  }
}

function markScheduled(standing: TeamStanding, roundIndex: number) {
  if (
    roundIndex >= 0 &&
    roundIndex < standing.results.length &&
    !standing.results[roundIndex]
  )
    standing.results[roundIndex] = { outcome: "t", score: 0 };
}

function roundIndexOf(matchup: PopulatedStageMatchup, rounds: RoundLike[]) {
  return rounds.findIndex(
    (round) => matchup.round && round._id.equals(matchup.round),
  );
}

function calculateStreak(results: StandingResult[]): number {
  let streak = 0;

  for (const result of results) {
    if (!result) continue;
    if (result.score > 0) {
      streak = streak >= 0 ? streak + 1 : 1;
    } else if (result.score < 0) {
      streak = streak <= 0 ? streak - 1 : -1;
    }
  }

  return streak;
}

export async function calculateDivisionTeamStandings(
  matchups: PopulatedStageMatchup[],
  stage: StageDocument & { teams: PopulatedTeam[] },
  tournament: AxisTournament & ScoringTournament,
) {
  const rules = resolveStandingsRules(tournament);
  const diffMode = tournament.diffMode;
  const rounds = tournament.rounds ?? [];
  const standings = new Map<string, TeamStanding>();
  for (const team of stage.teams) {
    const standing = createTeamStanding(team, rounds.length);
    standings.set(standing.teamId, standing);
  }

  const games: PlayedGame[] = [];
  for (const matchup of matchups) {
    const roundIndex = roundIndexOf(matchup, rounds);
    for (const side of SIDES) {
      const team = matchup[side].team;
      if (!team) continue;

      const teamId = team._id.toString();
      let standing = standings.get(teamId);
      if (!standing) {
        standing = createTeamStanding(team, rounds.length);
        standings.set(teamId, standing);
      }

      const result = sideResult(matchup, side, tournament.forfeit);
      if (!result) {
        markScheduled(standing, roundIndex);
        continue;
      }
      applySideResult(standing, roundIndex, result, rules, diffMode);

      const opponent = matchup[side === "side1" ? "side2" : "side1"].team;
      if (opponent)
        games.push({
          teamId,
          opponentId: opponent._id.toString(),
          points: pointsFor(result.outcome, rules.points),
        });
    }
  }

  const ranked = rankStandings(
    Array.from(standings.values()),
    games,
    rules.tiebreakers,
  );

  return {
    teamStandings: ranked.map((team) => ({
      name: team.name,
      results: team.results,
      coach: team.coach,
      streak: calculateStreak(team.results),
      wins: team.wins,
      draws: team.draws,
      losses: team.losses,
      points: team.points,
      gameDiff: team.gameDiff,
      pokemonDiff: team.pokemonDiff,
      logo: team.logo,
      diffMode,
      id: team.teamId,
      teamSlug: team.teamSlug,
    })),
    diffMode,
    rules,
  };
}

export async function calculateTeamScore(
  matchups: PopulatedStageMatchup[],
  rounds: RoundLike[],
  team: PopulatedTeam,
  tournament: ScoringTournament,
): Promise<TeamScore> {
  const rules = resolveStandingsRules(tournament);
  const diffMode = tournament.diffMode;
  const standing = createTeamStanding(team, rounds.length);
  let unplayed = 0;

  for (const matchup of matchups) {
    const side = SIDES.find(
      (candidate) => matchup[candidate].team?._id.equals(team._id),
    );
    if (!side) continue;

    const roundIndex = roundIndexOf(matchup, rounds);
    const result = sideResult(matchup, side, tournament.forfeit);
    if (!result) {
      unplayed += 1;
      markScheduled(standing, roundIndex);
      continue;
    }
    applySideResult(standing, roundIndex, result, rules, diffMode);
  }

  return {
    teamId: standing.teamId,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    points: standing.points,
    unplayed,
    streak: calculateStreak(standing.results),
    gameDiff: standing.gameDiff,
    pokemonDiff: standing.pokemonDiff,
    results: standing.results,
    diffMode,
  };
}
