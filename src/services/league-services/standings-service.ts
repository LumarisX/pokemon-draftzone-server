import { PopulatedLeagueMatchup } from "../../classes/matchup";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import { LeagueStageDocument } from "../../models/league/division.model";
import {
  LeagueMatchupDocument,
  MatchTeam,
} from "../../models/league/matchup.model";
import {
  LeagueTeamDocument,
  PopulatedLeagueTeamDocument,
} from "../../models/league/team.model";
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
      if (result.team1?.pokemon) {
        for (const [pokemonId, stats] of result.team1.pokemon.entries()) {
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
      if (result.team2?.pokemon) {
        for (const [pokemonId, stats] of result.team2.pokemon.entries()) {
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
  results: number[];
  coach: string;
  wins: number;
  losses: number;
  pokemonDiff: number;
  gameDiff: number;
  logo?: string;
  teamId: string;
};

export type TeamScore = {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  unplayed: number;
  streak: number;
  gameDiff: number;
  pokemonDiff: number;
  results: number[];
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
  teamSide: "team1" | "team2",
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
) {
  if (stageIndex >= 0) {
    standing.results[stageIndex] =
      diffMode === "game" ? stageDiff : pokemonDiff;
  }
  standing.gameDiff += stageDiff;
  standing.pokemonDiff += pokemonDiff;
}

function calculateStreak(results: number[]): number {
  let streak = 0;

  for (const result of results) {
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

  return streak;
}

export async function calculateDivisionCoachStandings(
  matchups: PopulatedLeagueMatchup[],
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
    const team1Doc = matchup.side1.team;
    const team2Doc = matchup.side2.team;
    if (matchup.results.length > 1) diffMode = "game";
    const team1Data = {
      score: matchup.score?.team1 ?? 0,
      standing: getOrCreateCoachStanding(
        coachStandingsMap,
        team1Doc,
        stages.length,
      ),
    };
    const team2Data = {
      score: matchup.score?.team2 ?? 0,
      standing: getOrCreateCoachStanding(
        coachStandingsMap,
        team2Doc,
        stages.length,
      ),
    };

    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.stage._id));

    const team1StageDiff = team1Data.score - team2Data.score;
    const team2StageDiff = team2Data.score - team1Data.score;
    const team1PokemonDiff = matchup.results.reduce(
      (sum, result) => sum + (result.team1.score ?? 0),
      0,
    );
    const team2PokemonDiff = matchup.results.reduce(
      (sum, result) => sum + (result.team2.score ?? 0),
      0,
    );

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
): Promise<TeamScore> {
  const teamStanding = createCoachStanding(team, stages.length);
  const teamId = team._id.toString();
  let diffMode: "pokemon" | "game" = "pokemon";
  let ties = 0;
  let unplayed = 0;

  for (const matchup of matchups) {
    const team1Id = matchup.side1.team._id.toString();
    const team2Id = matchup.side2.team._id.toString();
    const teamSide =
      team1Id === teamId ? "team1" : team2Id === teamId ? "team2" : null;

    if (!teamSide) continue;
    if (matchup.results.length > 1) diffMode = "game";

    const opponentSide = teamSide === "team1" ? "team2" : "team1";
    const teamScore = matchup.score?.[teamSide] ?? 0;
    const opponentScore = matchup.score?.[opponentSide] ?? 0;
    const teamPokemonFainted = calculateMatchupFainted(matchup, teamSide);
    const opponentPokemonFainted = calculateMatchupFainted(
      matchup,
      opponentSide,
    );
    const stageIndex = stages.findIndex((s) => s._id.equals(matchup.stage._id));

    if (matchup.winner === teamSide) {
      teamStanding.wins += 1;
    } else if (matchup.winner === opponentSide) {
      teamStanding.losses += 1;
    } else if (matchup.score && teamScore === opponentScore) {
      ties += 1;
    } else {
      unplayed += 1;
    }

    applyMatchupDiffs(
      teamStanding,
      stageIndex,
      teamScore - opponentScore,
      opponentPokemonFainted - teamPokemonFainted,
      diffMode,
    );
  }

  return {
    teamId,
    wins: teamStanding.wins,
    losses: teamStanding.losses,
    ties,
    played: teamStanding.wins + teamStanding.losses + ties,
    unplayed,
    streak: calculateStreak(teamStanding.results),
    gameDiff: teamStanding.gameDiff,
    pokemonDiff: teamStanding.pokemonDiff,
    results: teamStanding.results,
    diffMode,
  };
}
