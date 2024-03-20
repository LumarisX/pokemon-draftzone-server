import { getName } from "../data-services/pokedex.service";

async function getScore(teamId: string) {
  let matchups = await getMatchups(teamId);
  let score = { wins: 0, loses: 0, diff: "+0" };
  let usDiff = 0;
  for (let matchup of matchups) {
    if (matchup.aTeam.score > matchup.bTeam.score) {
      score.wins++;
      usDiff += matchup.aTeam.score - matchup.bTeam.score;
    } else if (matchup.aTeam.score < matchup.bTeam.score) {
      score.loses++;
      usDiff += matchup.aTeam.score - matchup.bTeam.score;
    }
  }
  score.diff = (usDiff < 0 ? "" : "+") + score.diff;
  return score;
}

async function getStats(draftId: string) {
  let matchups = await getMatchups(draftId);
  let stats: {
    [key: string]: {
      pokemon: { pid: string; name: string };
      kills: number;
      brought: number;
      indirect: number;
      deaths: number;
      kdr: number;
      kpg: number;
    };
  } = {};
  for (let matchup of matchups) {
    for (let pid of Object.keys(matchup.aTeam.stats)) {
      if (!(pid in stats)) {
        stats[pid] = {
          pokemon: { pid: pid, name: getName(pid) },
          kills: 0,
          brought: 0,
          indirect: 0,
          deaths: 0,
          kdr: 0,
          kpg: 0,
        };
      }
      stats[pid].kills += matchup.aTeam.stats[pid].kills
        ? matchup.aTeam.stats[pid].kills
        : 0;
      stats[pid].brought += matchup.aTeam.stats[pid].brought
        ? matchup.aTeam.stats[pid].brought
        : 0;
      stats[pid].indirect += matchup.aTeam.stats[pid].indirect
        ? matchup.aTeam.stats[pid].indirect
        : 0;
      stats[pid].deaths += matchup.aTeam.stats[pid].deaths
        ? matchup.aTeam.stats[pid].deaths
        : 0;
      for (let pid in stats) {
        stats[pid].kdr =
          stats[pid].kills + stats[pid].indirect - stats[pid].deaths;
        stats[pid].kpg =
          stats[pid].brought > 0
            ? (stats[pid].kills + stats[pid].indirect) / stats[pid].brought
            : 0;
      }
    }
  }
  return Object.values(stats);
}

async function getMatchups(draftId: string) {
  return await MatchupModel.find({ "aTeam._id": draftId })
    .sort({ createdAt: -1 })
    .lean();
}
