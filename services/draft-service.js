const MatchupModel = require("../models/matchupModel");

async function getScore(teamId) {
  let matchups = await getMatchups(teamId);
  let score = { wins: 0, loses: 0, diff: 0 };
  for (let matchup of matchups) {
    if (matchup.aTeam.score > matchup.bTeam.score) {
      score.wins++;
      score.diff += matchup.aTeam.score - matchup.bTeam.score;
    } else if (matchup.aTeam.score < matchup.bTeam.score) {
      score.loses++;
      score.diff -= matchup.aTeam.score - matchup.bTeam.score;
    }
  }
  score.diff = (score.diff < 0 ? "" : "+") + score.diff;
  return score;
}

async function getStats(draftId) {
  let matchups = await getMatchups(draftId)
  let stats = {}
  for (let matchup of matchups) {
    for (let pid of Object.keys(matchup.aTeam.stats)) {
      if (!(pid in stats)) {
        stats[pid] = {
          kills: 0,
          brought: 0,
          indirect: 0,
          deaths: 0
        }
      }
      stats[pid].kills += matchup.aTeam.stats[pid].kills ? matchup.aTeam.stats[pid].kills : 0
      stats[pid].brought += matchup.aTeam.stats[pid].brought ? matchup.aTeam.stats[pid].brought : 0
      stats[pid].indirect += matchup.aTeam.stats[pid].indirect ? matchup.aTeam.stats[pid].indirect : 0,
        stats[pid].deaths += matchup.aTeam.stats[pid].deaths ? matchup.aTeam.stats[pid].deaths : 0
    }
    /*for(let pid in stats){
      stats[pid].kd = stats[pid].kills + stats[pid].indirect - stats[pid].deaths
      stats[pid].kpg = stats[pid].brought > 0 ? stats[pid].kills / stats[pid].brought : 0
    }*/
  }
  return stats
}

async function archive(team_id){
  let matchups = await getMatchups(team_id)
  let matches = []
  for(let matchup in matchups){
    console.log(matchups)
    matches.push({
      stage: matchup.stage,
      teamName: matchup.bTeam,
      score: []
    })
  }
  return matches
}

async function getMatchups(draftId) {
  return await MatchupModel.find({ "aTeam._id": draftId })
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = { getScore, getStats, archive };