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
  score.diff = (numDiff < 0 ? "" : "+") + numDiff;
  return score;
}

export async function getStats(ruleset: Ruleset, draftId: string) {
  let matchups = await getMatchups(draftId);
  let stats: {
    [key: string]: {
      pokemon: { pid: ID; name: string };
      kills: number;
      brought: number;
      indirect: number;
      deaths: number;
      kdr: number;
      kpg: number;
    };
  } = {};
  for (const matchup of matchups) {
    console.log(matchup.bTeam.teamName, matchup.matches[0].aTeam.stats);
    let stat = Object.fromEntries(matchup.matches[0].aTeam.stats);
    console.log(stat);
    for (const pid in stat) {
      if (!(pid in stats)) {
        stats[pid] = {
          pokemon: { pid: toID(pid), name: getName(ruleset, toID(pid)) },
          kills: 0,
          brought: 0,
          indirect: 0,
          deaths: 0,
          kdr: 0,
          kpg: 0,
        };
      }
      const teamStats = stat[toID(pid)];
      if (teamStats) {
        stats[pid].kills += teamStats.kills ?? 0;
        stats[pid].brought += teamStats.brought ?? 0;
        stats[pid].indirect += teamStats.indirect ?? 0;
        stats[pid].deaths += teamStats.deaths ?? 0;
      }
    }
  }

  for (let pid in stats) {
    stats[pid].kdr = stats[pid].kills + stats[pid].indirect - stats[pid].deaths;
    stats[pid].kpg =
      stats[pid].brought > 0
        ? (stats[pid].kills + stats[pid].indirect) / stats[pid].brought
        : 0;
  }
  return Object.values(stats);
}

export async function getMatchups(draftId: string) {
  return await MatchupModel.find({ "aTeam._id": draftId })
    .sort({ createdAt: -1 })
    .lean();
}
