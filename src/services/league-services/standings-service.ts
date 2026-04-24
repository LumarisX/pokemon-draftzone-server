import { PopulatedLeagueMatchup } from "../../classes/matchup";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import {
  LeagueDivisionDocument,
  LeagueStageDocument,
} from "../../models/league/division.model";
import {
  LeagueMatchupDocument,
  MatchTeam,
} from "../../models/league/matchup.model";
import {
  LeagueTeamDocument,
  PopulatedLeagueTeamDocument,
} from "../../models/league/team.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { getName } from "../data-services/pokedex.service";

export async function calculateDivisionPokemonStandings(
  matchups: PopulatedLeagueMatchup[],
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
    const team1Doc = matchup.side1.team;
    const team2Doc = matchup.side2.team;
    const team1Coach = team1Doc.coach?.teamName || "Unknown Coach";
    const team2Coach = team2Doc.coach?.teamName || "Unknown Coach";
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
              teamName: team1Doc.coach?.teamName,
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

      // Process team2 pokemon
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
              teamName: team2Doc.coach?.teamName,
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

type DivisionCoachMatchup = LeagueMatchupDocument & {
  team1: LeagueTeamDocument & { coach: LeagueCoachDocument };
  team2: LeagueTeamDocument & { coach: LeagueCoachDocument };
};

type CoachStanding = {
  name: string;
  results: ({
    outcome: "w" | "l" | "t" | "ff";
    score: number;
  } | null)[];
  coach: string;
  wins: number;
  losses: number;
  pokemonDiff: number;
  gameDiff: number;
  logo?: string;
  teamId: string;
};

type ForfeitConfig = {
  gameDiff: number;
  pokemonDiff: number;
};

type TeamSide = "side1" | "side2";

type ResolvedMatchupResult = {
  wins: number;
  losses: number;
  unplayed: number;
  outcome: "w" | "l" | "t" | "ff";
  stageDiff: number;
  pokemonDiff: number;
};

export type TeamScore = {
  teamId: string;
  wins: number;
  losses: number;
  unplayed: number;
  streak: number;
  gameDiff: number;
  pokemonDiff: number;
  results: ({
    outcome: "w" | "l" | "t" | "ff";
    score: number;
  } | null)[];
  diffMode: "pokemon" | "game";
};

function createCoachStanding(
  team: LeagueTeamDocument,
  stageCount: number,
): CoachStanding {
  const teamKey = team._id.toString();
  const coach = team.coach as LeagueCoachDocument;

  return {
    name: coach.teamName,
    results: Array(stageCount).fill(null),
    coach: coach.name,
    logo: coach.logo,
    wins: 0,
    losses: 0,
    pokemonDiff: 0,
    gameDiff: 0,
    teamId: teamKey,
  };
}

function getOrCreateCoachStanding(
  coachStandingsMap: Map<string, CoachStanding>,
  team: LeagueTeamDocument,
  stageCount: number,
): CoachStanding {
  const teamKey = team._id.toString();
  const existingStanding = coachStandingsMap.get(teamKey);
  if (existingStanding) {
    return existingStanding;
  }

  const newStanding = createCoachStanding(team, stageCount);
  coachStandingsMap.set(teamKey, newStanding);
  return newStanding;
}

function countTeamFainted(teamResult?: MatchTeam): number {
  if (!teamResult?.pokemon) return 0;
  return Array.from(teamResult.pokemon.values()).reduce((pokemonSum, stats) => {
    const survived = stats.status === "fainted" ? 1 : 0;
    return pokemonSum + survived;
  }, 0);
}

function calculateMatchupFainted(
  matchup: LeagueMatchupDocument & {
    side1: { team: PopulatedLeagueTeamDocument };
    side2: { team: PopulatedLeagueTeamDocument };
  },
  teamSide: "side1" | "side2",
): number {
  return (
    matchup.results?.reduce((sum, result) => {
      return sum + countTeamFainted(result[teamSide]);
    }, 0) ?? 0
  );
}

function applyMatchupDiffs(
  standing: CoachStanding,
  stageIndex: number,
  stageDiff: number,
  pokemonDiff: number,
  diffMode: "game" | "pokemon",
  outcome: "w" | "l" | "t" | "ff",
) {
  if (stageIndex >= 0 && stageIndex < standing.results.length) {
    standing.results[stageIndex] = {
      outcome,
      score: diffMode === "game" ? stageDiff : pokemonDiff,
    };
  }
  standing.gameDiff += stageDiff;
  standing.pokemonDiff += pokemonDiff;
}

function resolveTeamMatchupResult({
  winner,
  forfeit,
  teamSide,
  stageDiff,
  pokemonDiff,
  forfeitConfig,
}: {
  winner: LeagueMatchupDocument["winner"];
  forfeit?: boolean;
  teamSide: TeamSide;
  stageDiff: number;
  pokemonDiff: number;
  forfeitConfig?: ForfeitConfig;
}): ResolvedMatchupResult {
  const opponentSide: TeamSide = teamSide === "side1" ? "side2" : "side1";

  if (forfeit === true) {
    const didWin = winner === teamSide;
    const didLose = winner === opponentSide || winner === "draw";
    const gameDiff = forfeitConfig?.gameDiff ?? 0;
    const forfeitPokemonDiff = forfeitConfig?.pokemonDiff ?? 0;

    return {
      wins: didWin ? 1 : 0,
      losses: didLose ? 1 : 0,
      unplayed: didWin || didLose ? 0 : 1,
      outcome: didWin ? "w" : didLose ? "ff" : "t",
      stageDiff: didWin ? gameDiff : didLose ? -gameDiff : 0,
      pokemonDiff: didWin
        ? forfeitPokemonDiff
        : didLose
          ? -forfeitPokemonDiff
          : 0,
    };
  }

  const didWin = winner === teamSide;
  const didLose = winner === opponentSide;

  return {
    wins: didWin ? 1 : 0,
    losses: didLose ? 1 : 0,
    unplayed: didWin || didLose ? 0 : 1,
    outcome: didWin ? "w" : didLose ? "l" : "t",
    stageDiff,
    pokemonDiff,
  };
}

function applyResolvedMatchupResult(
  standing: CoachStanding,
  stageIndex: number,
  diffMode: "game" | "pokemon",
  result: ResolvedMatchupResult,
) {
  standing.wins += result.wins;
  standing.losses += result.losses;
  applyMatchupDiffs(
    standing,
    stageIndex,
    result.stageDiff,
    result.pokemonDiff,
    diffMode,
    result.outcome,
  );
}

function calculateStreak(
  results: ({
    score: number;
  } | null)[],
): number {
  let streak = 0;

  for (const result of results) {
    if (!result) continue;
    if (result.score > 0) {
      if (streak >= 0) {
        streak += 1;
      } else {
        streak = 1;
      }
    } else if (result.score < 0) {
      if (streak <= 0) {
        streak -= 1;
      } else {
        streak = -1;
      }
    }
  }

  return streak;
}

export async function calculateDivisionCoachStandings(
  matchups: PopulatedLeagueMatchup[],
  division: LeagueDivisionDocument & {
    teams: LeagueTeamDocument[];
  },
  tournament: LeagueTournamentDocument,
) {
  const coachStandingsMap = new Map<string, CoachStanding>();
  const diffMode = tournament.diffMode;
  for (const team of division.teams) {
    const teamStanding = createCoachStanding(team, division.stages.length);
    coachStandingsMap.set(teamStanding.teamId, teamStanding);
  }

  for (const matchup of matchups) {
    const team1Doc = matchup.side1.team;
    const team2Doc = matchup.side2.team;
    const team1Standing = getOrCreateCoachStanding(
      coachStandingsMap,
      team1Doc,
      division.stages.length,
    );
    const stageIndex = division.stages.findIndex((s) =>
      s._id.equals(matchup.round._id),
    );
    const team2Standing = getOrCreateCoachStanding(
      coachStandingsMap,
      team2Doc,
      division.stages.length,
    );

    const team1Score = matchup.side1.score ?? 0;
    const team2Score = matchup.side2.score ?? 0;

    const team1StageDiff = team1Score - team2Score;
    const team1PokemonDiff = matchup.results.reduce(
      (sum, result) =>
        sum +
        (result.winner === "side1"
          ? result.side1.score || 0
          : -1 * (result.side2.score || 0)),
      0,
    );

    const team2StageDiff = team2Score - team1Score;
    const team2PokemonDiff = matchup.results.reduce(
      (sum, result) =>
        sum +
        (result.winner === "side2"
          ? result.side2.score || 0
          : -1 * (result.side1.score || 0)),
      0,
    );

    const team1Result = resolveTeamMatchupResult({
      winner: matchup.winner,
      forfeit: matchup.forfeit,
      teamSide: "side1",
      stageDiff: team1StageDiff,
      pokemonDiff: team1PokemonDiff,
      forfeitConfig: tournament.forfeit,
    });
    applyResolvedMatchupResult(
      team1Standing,
      stageIndex,
      diffMode,
      team1Result,
    );

    const team2Result = resolveTeamMatchupResult({
      winner: matchup.winner,
      forfeit: matchup.forfeit,
      teamSide: "side2",
      stageDiff: team2StageDiff,
      pokemonDiff: team2PokemonDiff,
      forfeitConfig: tournament.forfeit,
    });
    applyResolvedMatchupResult(
      team2Standing,
      stageIndex,
      diffMode,
      team2Result,
    );
  }

  return {
    coachStandings: Array.from(coachStandingsMap.values())
      .map((team) => {
        return {
          name: team.name,
          results: team.results,
          coach: team.coach,
          streak: calculateStreak(team.results),
          wins: team.wins,
          losses: team.losses,
          gameDiff: team.gameDiff,
          pokemonDiff: team.pokemonDiff,
          logo: team.logo,
          diffMode,
          id: team.teamId,
        };
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
        if (b.pokemonDiff !== a.pokemonDiff)
          return b.pokemonDiff - a.pokemonDiff;
        return 0;
      }),
    diffMode,
  };
}

export async function calculateTeamScore(
  matchups: (LeagueMatchupDocument & {
    side1: { team: PopulatedLeagueTeamDocument };
    side2: { team: PopulatedLeagueTeamDocument };
  })[],
  stages: LeagueStageDocument[],
  team: LeagueTeamDocument,
  forfeitConfig?: ForfeitConfig,
): Promise<TeamScore> {
  const teamStanding = createCoachStanding(team, stages.length);
  const teamId = team._id.toString();
  let diffMode: "pokemon" | "game" = "pokemon";
  let unplayed = 0;

  for (const matchup of matchups) {
    const team1Id = matchup.side1.team._id.toString();
    const team2Id = matchup.side2.team._id.toString();
    const teamSide =
      team1Id === teamId ? "side1" : team2Id === teamId ? "side2" : null;

    if (!teamSide) continue;
    if (matchup.results.length > 1) diffMode = "game";

    const opponentSide = teamSide === "side1" ? "side2" : "side1";
    const teamScore = matchup[teamSide].score ?? 0;
    const opponentScore = matchup[opponentSide].score ?? 0;
    const teamPokemonFainted = calculateMatchupFainted(matchup, teamSide);
    const opponentPokemonFainted = calculateMatchupFainted(
      matchup,
      opponentSide,
    );
    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.round._id));

    const result = resolveTeamMatchupResult({
      winner: matchup.winner,
      forfeit: matchup.forfeit,
      teamSide,
      stageDiff: teamScore - opponentScore,
      pokemonDiff: opponentPokemonFainted - teamPokemonFainted,
      forfeitConfig,
    });

    applyResolvedMatchupResult(teamStanding, stageIndex, diffMode, result);
    unplayed += result.unplayed;
  }

  return {
    teamId,
    wins: teamStanding.wins,
    losses: teamStanding.losses,
    unplayed,
    streak: calculateStreak(teamStanding.results),
    gameDiff: teamStanding.gameDiff,
    pokemonDiff: teamStanding.pokemonDiff,
    results: teamStanding.results,
    diffMode,
  };
}
