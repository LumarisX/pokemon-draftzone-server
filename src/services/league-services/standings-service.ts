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

    // Process all results (matches) in the matchup
    for (const result of matchup.results || []) {
      // Process team1 pokemon
      if (result.team1?.pokemon) {
        for (const [pokemonId, stats] of result.team1.pokemon.entries()) {
          if (filterTeamId && team1Key !== filterTeamId) {
            continue;
          }

          const pokemonKey = `${pokemonId}-${team1Key}`;

          if (!pokemonStandingsMap.has(pokemonKey)) {
            const pokemonNameFromDraft = team1Doc.draft?.find(
              (d: any) => d.pokemon.id === pokemonId,
            )?.pokemon?.id;
            pokemonStandingsMap.set(pokemonKey, {
              id: pokemonId,
              name: pokemonNameFromDraft || pokemonId,
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
      if (result.team2?.pokemon) {
        for (const [pokemonId, stats] of result.team2.pokemon.entries()) {
          if (filterTeamId && team2Key !== filterTeamId) {
            continue;
          }

          const pokemonKey = `${pokemonId}-${team2Key}`;

          if (!pokemonStandingsMap.has(pokemonKey)) {
            const pokemonNameFromDraft = team2Doc.draft?.find(
              (d: any) => d.pokemon.id === pokemonId,
            )?.pokemon?.id;
            pokemonStandingsMap.set(pokemonKey, {
              id: pokemonId,
              name: pokemonNameFromDraft || pokemonId,
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
  results: number[];
  coach: string;
  wins: number;
  losses: number;
  pokemonDiff: number;
  gameDiff: number;
  logo?: string;
  teamId: string;
};

function createCoachStanding(
  team: LeagueTeamDocument,
  stageCount: number,
): CoachStanding {
  const teamKey = team._id.toString();
  const coach = team.coach as LeagueCoachDocument;

  return {
    name: coach.teamName,
    results: Array(stageCount).fill(0),
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

function countTeamSurvivors(teamResult?: MatchTeam): number {
  if (!teamResult?.pokemon) {
    return 0;
  }

  return Array.from(teamResult.pokemon.values()).reduce((pokemonSum, stats) => {
    const survived =
      stats.status !== undefined && stats.status !== "fainted" ? 1 : 0;
    return pokemonSum + survived;
  }, 0);
}

function calculateMatchupSurvivors(
  matchup: DivisionCoachMatchup,
  teamSide: "team1" | "team2",
): number {
  return (
    matchup.results?.reduce((sum, result) => {
      return sum + countTeamSurvivors(result[teamSide]);
    }, 0) ?? 0
  );
}

function applyMatchupDiffs(
  standing: CoachStanding,
  stageIndex: number,
  stageDiff: number,
  pokemonDiff: number,
  diffMode: "game" | "pokemon",
) {
  if (stageIndex >= 0) {
    standing.results[stageIndex] =
      diffMode === "game" ? stageDiff : pokemonDiff;
  }
  standing.gameDiff += stageDiff;
  standing.pokemonDiff += pokemonDiff;
}

export async function calculateDivisionCoachStandings(
  matchups: DivisionCoachMatchup[],
  stages: LeagueStageDocument[],
  divisionTeams: LeagueTeamDocument[],
) {
  const coachStandingsMap = new Map<string, CoachStanding>();
  let diffMode: "pokemon" | "game" = "pokemon";

  for (const team of divisionTeams) {
    const teamStanding = createCoachStanding(team, stages.length);
    coachStandingsMap.set(teamStanding.teamId, teamStanding);
  }

  for (const matchup of matchups) {
    const team1Doc = matchup.team1;
    const team2Doc = matchup.team2;
    if (matchup.results.length > 1) diffMode = "game";
    const team1Data = {
      score: matchup.score?.team1 ?? 0,
      pokemonScore: calculateMatchupSurvivors(matchup, "team1"),
      standing: getOrCreateCoachStanding(
        coachStandingsMap,
        team1Doc,
        stages.length,
      ),
    };
    const team2Data = {
      score: matchup.score?.team2 ?? 0,
      pokemonScore: calculateMatchupSurvivors(matchup, "team2"),
      standing: getOrCreateCoachStanding(
        coachStandingsMap,
        team2Doc,
        stages.length,
      ),
    };

    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.stage._id));

    const team1StageDiff = team1Data.score - team2Data.score;
    const team2StageDiff = team2Data.score - team1Data.score;
    const team1PokemonDiff = team1Data.pokemonScore - team2Data.pokemonScore;
    const team2PokemonDiff = team2Data.pokemonScore - team1Data.pokemonScore;

    const winner = matchup.winner;

    if (winner === "team1") {
      team1Data.standing.wins += 1;
      team2Data.standing.losses += 1;
    } else if (winner === "team2") {
      team2Data.standing.wins += 1;
      team1Data.standing.losses += 1;
    }

    applyMatchupDiffs(
      team1Data.standing,
      stageIndex,
      team1StageDiff,
      team1PokemonDiff,
      diffMode,
    );
    applyMatchupDiffs(
      team2Data.standing,
      stageIndex,
      team2StageDiff,
      team2PokemonDiff,
      diffMode,
    );
  }

  return {
    coachStandings: Array.from(coachStandingsMap.values())
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
          gameDiff: team.gameDiff,
          pokemonDiff: team.pokemonDiff,
          logo: team.logo,
          diffMode,
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
