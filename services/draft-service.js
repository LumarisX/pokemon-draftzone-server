const MatchupModel = require('../models/matchupModel')

async function getScore(teamId) {
  let matchups = await getMatchups(teamId)
  let score = { wins: 0, loses: 0, diff: 0 }
  for (let matchup of matchups) {
    if("score" in matchup){
      let muScore = matchup.score
      if (muScore[0] > muScore[1]) {
          score.wins++
          score.diff += muScore[0]-muScore[1]
      } else if (muScore[0] < muScore[1]) {
        score.loses++
        score.diff -= muScore[1]-muScore[0]
      }
    }
  }
  score.diff = (score.diff<0?"":"+") + score.diff
  return score
}

async function getMatchups(teamId) {
  return await MatchupModel.find({ 'aTeam._id': teamId }).lean()
}

module.exports = { getScore }