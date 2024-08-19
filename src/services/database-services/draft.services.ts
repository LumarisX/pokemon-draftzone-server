import { ID, toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { MatchupModel } from "../../models/matchup.model";
import { getName } from "../data-services/pokedex.service";

export async function getScore(teamId: string) {
  let matchups = await getMatchups(teamId);
  let score = { wins: 0, loses: 0, diff: "+0" };
  let numDiff = 0;
  let gameDiff = matchups.some((matchup) => matchup.matches.length > 1);
  if (gameDiff) {
    matchups.forEach((matchup) => {
      let matchupWins = 0;
      let matchupLoses = 0;
      matchup.matches.forEach((match) => {
        if (match.winner === "a") {
          matchupWins++;
        } else if (match.winner === "b") {
          matchupLoses++;
        }
      });
      if (matchupWins > matchupLoses) {
        score.wins++;
      } else if (matchupLoses > matchupWins) {
        score.loses++;
      }
      numDiff += matchupWins - matchupLoses;
    });
  } else {
    for (let matchup of matchups) {
      if (matchup.matches[0]) {
        if (matchup.matches[0].aTeam.score > matchup.matches[0].bTeam.score) {
          score.wins++;
        } else if (
          matchup.matches[0].aTeam.score < matchup.matches[0].bTeam.score
        ) {
          score.loses++;
        }
        numDiff +=
          matchup.matches[0].aTeam.score - matchup.matches[0].bTeam.score;
      }
    }
  }
  score.diff = (numDiff < 0 ? "" : "+") + numDiff;
  return score;
}

export async function getStats(ruleset: Ruleset, draftId: string) {
  let matchups = await getMatchups(draftId);
  let stats: {
    [key: string]: {
      pokemon: { id: ID; name: string };
      kills: number;
      brought: number;
      indirect: number;
      deaths: number;
      kdr: number;
      kpg: number;
    };
  } = {};
  for (const matchup of matchups) {
    let stat = Object.fromEntries(matchup.matches[0].aTeam.stats);
    for (const id in stat) {
      if (!(id in stats)) {
        stats[id] = {
          pokemon: { id: toID(id), name: getName(id) },
          kills: 0,
          brought: 0,
          indirect: 0,
          deaths: 0,
          kdr: 0,
          kpg: 0,
        };
      }
      const teamStats = stat[toID(id)];
      if (teamStats) {
        stats[id].kills += teamStats.kills ?? 0;
        stats[id].brought += teamStats.brought ?? 0;
        stats[id].indirect += teamStats.indirect ?? 0;
        stats[id].deaths += teamStats.deaths ?? 0;
      }
    }
  }

  for (let id in stats) {
    stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
    stats[id].kpg =
      stats[id].brought > 0
        ? (stats[id].kills + stats[id].indirect) / stats[id].brought
        : 0;
  }
  return Object.values(stats);
}

export async function getMatchups(draftId: string) {
  return await MatchupModel.find({ "aTeam._id": draftId })
    .sort({ createdAt: -1 })
    .lean();
}
