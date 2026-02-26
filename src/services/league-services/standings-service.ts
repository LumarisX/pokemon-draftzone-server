import { LeagueCoachDocument } from "../../models/league/coach.model";
import { LeagueStageDocument } from "../../models/league/division.model";
import {
  LeagueMatchupDocument,
  MatchTeam,
} from "../../models/league/matchup.model";
import { LeagueTeamDocument } from "../../models/league/team.model";

// export function getResultScore(team: MatchTeam): number {
//   if (team.score !== undefined) return team.score;
//   return Array.from(team.pokemon.values()).reduce((sum, pokemon) => {
//     const deaths = pokemon.deaths ?? 0;
//     if (deaths < 1) return sum + (pokemon.brought ?? 0);
//     return sum;
//   }, 0);
// }

// export function calculateTeamMatchupScore(
//   matchup: LeagueMatchupDocument,
//   teamNumber: "team1" | "team2",
// ): number {
//   if (matchup.score) {
//     return teamNumber === "team1" ? matchup.score.team1 : matchup.score.team2;
//   }

//   if (!matchup.results || matchup.results.length === 0) {
//     return 0;
//   }

//   if (matchup.results.length === 1) {
//     return teamNumber === "team1"
//       ? getResultScore(matchup.results[0].team1)
//       : getResultScore(matchup.results[0].team2);
//   }

//   return matchup.results.reduce((wins: number, result: any) => {
//     if (teamNumber === "team1" && result.winner === "team1") {
//       return wins + 1;
//     }
//     if (teamNumber === "team2" && result.winner === "team2") {
//       return wins + 1;
//     }
//     return wins;
//   }, 0);
// }

// export function calculateTeamMatchupScoreAndWinner(matchup: any): {
//   team1Score: number;
//   team2Score: number;
//   winner: "team1" | "team2" | undefined;
// } {
//   const team1Score = calculateTeamMatchupScore(matchup, "team1");
//   const team2Score = calculateTeamMatchupScore(matchup, "team2");
//   if (matchup.scoreOverride)
//     return {
//       team1Score,
//       team2Score,
//       winner: matchup.scoreOverride.winner,
//     };
//   if (team1Score > team2Score)
//     return { team1Score, team2Score, winner: "team1" };
//   if (team2Score > team1Score)
//     return { team1Score, team2Score, winner: "team2" };
//   return { team1Score, team2Score, winner: undefined };
// }

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
    const team1Doc = matchup.team1 as any;
    const team2Doc = matchup.team2 as any;
    const team1Coach = team1Doc.coach?.teamName || "Unknown Coach";
    const team2Coach = team2Doc.coach?.teamName || "Unknown Coach";
    const team1Key = team1Doc._id.toString();
    const team2Key = team2Doc._id.toString();

    for (const pokemon of matchup.results[0]?.team1?.pokemon || []) {
      const pokemonId = pokemon.id;

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

    for (const pokemon of matchup.results[0]?.team2?.pokemon || []) {
      const pokemonId = pokemon.id;

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

export async function calculateDivisionCoachStandings(
  matchups: (LeagueMatchupDocument & {
    team1: LeagueTeamDocument & { coach: LeagueCoachDocument };
    team2: LeagueTeamDocument & { coach: LeagueCoachDocument };
  })[],
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
    const team1Doc = matchup.team1 as LeagueTeamDocument & {
      coach: LeagueCoachDocument;
    };
    const team2Doc = matchup.team2 as LeagueTeamDocument & {
      coach: LeagueCoachDocument;
    };
    const team1Score = matchup.score?.team1 ?? 0;
    const team2Score = matchup.score?.team2 ?? 0;
    const winner = matchup.winner;

    const team1Key = team1Doc._id.toString();
    const team2Key = team2Doc._id.toString();

    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.stage._id));

    if (!coachStandingsMap.has(team1Key)) {
      coachStandingsMap.set(team1Key, {
        name: team1Doc.coach.teamName,
        results: Array(stages.length).fill(0),
        coach: team1Doc.coach.name,
        wins: 0,
        losses: 0,
        diff: 0,
        logo: team1Doc.coach.logo,
        teamId: team1Key,
      });
    }
    if (!coachStandingsMap.has(team2Key)) {
      coachStandingsMap.set(team2Key, {
        name: team2Doc.coach.teamName,
        results: Array(stages.length).fill(0),
        coach: team2Doc.coach.name,
        wins: 0,
        losses: 0,
        diff: 0,
        logo: team2Doc.coach.logo,
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
