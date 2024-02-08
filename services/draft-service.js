const MatchupModel = require('../models/matchupModel')

async function getScore(teamId) {
  let matchups = await getMatchups(teamId)
  let score = { wins: 0, loses: 0 }
  for (let matchup of matchups) {
    let muScore = matchup.score
    if (muScore[0] > muScore[1]) {
      score.wins = score.wins + 1
    } else if (muScore[0] < muScore[1]) {
      score.loses = score.loses + 1
    }
  }
  return score
}

async function getMatchups(teamId) {
  return await MatchupModel.find({ 'aTeam._id': teamId })
}

module.exports = { getScore }