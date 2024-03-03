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
  console.log(score);
  return score;
}

async function getMatchups(teamId) {
  return await MatchupModel.find({ "aTeam._id": teamId }).lean();
}

module.exports = { getScore };
