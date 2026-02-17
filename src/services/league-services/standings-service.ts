import { LeagueCoachDocument } from "../../models/league/coach.model";
import { LeagueMatchupDocument } from "../../models/league/matchup.model";
import { LeagueStageDocument } from "../../models/league/stage.model";
import { LeagueTeamDocument } from "../../models/league/team.model";

// Helper function to calculate score for a result
export function calculateResultScore(team: {
  score?: number;
  pokemon: { stats?: { brought?: number; deaths?: number } }[];
}): number {
  if (team.score !== undefined) {
    return team.score;
  }
  // Sum pokemon.brought where deaths < 1 (i.e., 0 or undefined)
  return team.pokemon.reduce((sum, pokemon) => {
    const deaths = pokemon.stats?.deaths ?? 0;
    if (deaths < 1) {
      return sum + (pokemon.stats?.brought ?? 0);
    }
    return sum;
  }, 0);
}

// Helper function to calculate team matchup score for a matchup
export function calculateTeamMatchupScore(
  matchup: any,
  teamNumber: "team1" | "team2",
): number {
  // If scoreOverride exists, use it
  if (matchup.scoreOverride) {
    return teamNumber === "team1"
      ? matchup.scoreOverride.team1score
      : matchup.scoreOverride.team2score;
  }

  // If no results, score is 0
  if (!matchup.results || matchup.results.length === 0) {
    return 0;
  }

  // If only 1 match, use that match's score
  if (matchup.results.length === 1) {
    return teamNumber === "team1"
      ? calculateResultScore(matchup.results[0].team1)
      : calculateResultScore(matchup.results[0].team2);
  }

  // Multiple matches: count wins
  return matchup.results.reduce((wins: number, result: any) => {
    if (teamNumber === "team1" && result.winner === "team1") {
      return wins + 1;
    }
    if (teamNumber === "team2" && result.winner === "team2") {
      return wins + 1;
    }
    return wins;
  }, 0);
}

// Helper function to calculate team matchup score and determine winner
export function calculateTeamMatchupScoreAndWinner(matchup: any): {
  team1Score: number;
  team2Score: number;
  winner: "team1" | "team2" | undefined;
} {
  const team1Score = calculateTeamMatchupScore(matchup, "team1");
  const team2Score = calculateTeamMatchupScore(matchup, "team2");

  // If scoreOverride exists, use its winner
  if (matchup.scoreOverride) {
    return {
      team1Score,
      team2Score,
      winner: matchup.scoreOverride.winner,
    };
  }

  // Otherwise determine winner based on scores
  if (team1Score > team2Score) {
    return { team1Score, team2Score, winner: "team1" };
  }
  if (team2Score > team1Score) {
    return { team1Score, team2Score, winner: "team2" };
  }

  // Scores are equal
  return { team1Score, team2Score, winner: undefined };
}

// Calculate pokemon standings for a division
export async function calculateDivisionPokemonStandings(
  matchups: any[],
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
    const team1Doc = matchup.team1Id as any;
    const team2Doc = matchup.team2Id as any;
    const team1Coach = team1Doc.coach?.teamName || "Unknown Coach";
    const team2Coach = team2Doc.coach?.teamName || "Unknown Coach";
    const team1Key = team1Doc._id.toString();
    const team2Key = team2Doc._id.toString();

    // Process pokemon stats for team1
    for (const pokemon of matchup.results[0]?.team1?.pokemon || []) {
      const pokemonId = pokemon.id;

      // Skip if filter is provided and team doesn't match
      if (filterTeamId && team1Key !== filterTeamId) {
        continue;
      }

      const pokemonKey = `${pokemonId}-${team1Key}`;

      if (!pokemonStandingsMap.has(pokemonKey)) {
        pokemonStandingsMap.set(pokemonKey, {
          id: pokemonId,
          name: pokemon.name,
          coach: team1Coach,
          teamName: team1Doc.coach?.teamName,
          teamId: team1Key,
          brought: 0,
          kills: 0,
          deaths: 0,
        });
      }

      const pokemonStats = pokemonStandingsMap.get(pokemonKey)!;
      pokemonStats.brought += pokemon.stats?.brought ?? 0;
      pokemonStats.kills +=
        (pokemon.stats?.kills ?? 0) + (pokemon.stats?.indirect ?? 0);
      pokemonStats.deaths += pokemon.stats?.deaths ?? 0;
    }

    // Process pokemon stats for team2
    for (const pokemon of matchup.results[0]?.team2?.pokemon || []) {
      const pokemonId = pokemon.id;

      // Skip if filter is provided and team doesn't match
      if (filterTeamId && team2Key !== filterTeamId) {
        continue;
      }

      const pokemonKey = `${pokemonId}-${team2Key}`;

      if (!pokemonStandingsMap.has(pokemonKey)) {
        pokemonStandingsMap.set(pokemonKey, {
          id: pokemonId,
          name: pokemon.name,
          coach: team2Coach,
          teamName: team2Doc.coach?.teamName,
          teamId: team2Key,
          brought: 0,
          kills: 0,
          deaths: 0,
        });
      }

      const pokemonStats = pokemonStandingsMap.get(pokemonKey)!;
      pokemonStats.brought += pokemon.stats?.brought ?? 0;
      pokemonStats.kills +=
        (pokemon.stats?.kills ?? 0) + (pokemon.stats?.indirect ?? 0);
      pokemonStats.deaths += pokemon.stats?.deaths ?? 0;
    }
  }

  // Convert pokemon standings to array
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
      // Sort by kills descending, then by diff descending
      if (b.record.kills !== a.record.kills)
        return b.record.kills - a.record.kills;
      return b.record.diff - a.record.diff;
    });
}

// Calculate coach standings for a division
export async function calculateDivisionCoachStandings(
  matchups: LeagueMatchupDocument[],
  stages: LeagueStageDocument[],
  divisionTeams: LeagueTeamDocument[],
) {
  const coachStandingsMap = new Map<
    string,
    {
      name: string;
      results: number[];
      coach: string;
      wins: number;
      losses: number;
      diff: number;
      logo?: string;
      teamId: string;
    }
  >();

  for (const team of divisionTeams) {
    const teamKey = team._id.toString();
    const coach = team.coach as LeagueCoachDocument;

    coachStandingsMap.set(teamKey, {
      name: coach.teamName,
      results: Array(stages.length).fill(0),
      coach: coach.name,
      logo: coach.logo,
      wins: 0,
      losses: 0,
      diff: 0,
      teamId: teamKey,
    });
  }

  for (const matchup of matchups) {
    const team1Doc = matchup.team1Id as any;
    const team2Doc = matchup.team2Id as any;
    const { team1Score, team2Score, winner } =
      calculateTeamMatchupScoreAndWinner(matchup);

    const team1Key = team1Doc._id.toString();
    const team2Key = team2Doc._id.toString();

    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.stageId));

    if (!coachStandingsMap.has(team1Key)) {
      coachStandingsMap.set(team1Key, {
        name: team1Doc.name,
        results: Array(stages.length).fill(0),
        coach: team1Doc.coach.toString(),
        wins: 0,
        losses: 0,
        diff: 0,
        logo: team1Doc.logo,
        teamId: team1Key,
      });
    }
    if (!coachStandingsMap.has(team2Key)) {
      coachStandingsMap.set(team2Key, {
        name: team2Doc.name,
        results: Array(stages.length).fill(0),
        coach: team2Doc.coach.toString(),
        wins: 0,
        losses: 0,
        diff: 0,
        logo: team2Doc.logo,
        teamId: team2Key,
      });
    }

    const team1Standing = coachStandingsMap.get(team1Key)!;
    const team2Standing = coachStandingsMap.get(team2Key)!;

    const team1StageDiff = team1Score - team2Score;
    const team2StageDiff = team2Score - team1Score;

    if (winner === "team1") {
      team1Standing.wins += 1;
      team2Standing.losses += 1;
    } else if (winner === "team2") {
      team2Standing.wins += 1;
      team1Standing.losses += 1;
    }

    team1Standing.results[stageIndex] = team1StageDiff;
    team2Standing.results[stageIndex] = team2StageDiff;

    team1Standing.diff += team1StageDiff;
    team2Standing.diff += team2StageDiff;
  }

  return Array.from(coachStandingsMap.values())
    .map((team) => {
      let streak = 0;

      for (const result of team.results) {
        if (result > 0) {
          if (streak >= 0) {
            streak += 1;
          } else {
            streak = 1;
          }
        } else if (result < 0) {
          if (streak <= 0) {
            streak -= 1;
          } else {
            streak = -1;
          }
        }
      }

      return {
        name: team.name,
        results: team.results,
        coach: team.coach,
        streak,
        wins: team.wins,
        loses: team.losses,
        diff: team.diff,
        logo: team.logo,
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.diff - a.diff;
    });
}
