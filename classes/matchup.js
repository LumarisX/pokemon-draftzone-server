const matchupModel = require('../models/matchupModel')
const Pokemon = require('./pokemon')
const mongoose = require('mongoose')

class Matchup {

  model = null
  errors = []
  valid = true

  constructor(formData, aTeamId) {
    let data = {}
    data.aTeam = {
      _id: new mongoose.Types.ObjectId(aTeamId)
    }
    data.bTeam = {}
    data.bTeam.teamName = formData.teamName
    data.stage = formData.stage
    data.bTeam.team = []
    for (let pokemonData of formData.team) {
      let pokemon = new Pokemon(pokemonData)
      if (pokemon.error) {
        this.errors.push(pokemon.error)
        this.valid = false
      } else {
        data.bTeam.team.push(pokemon.data)
      }
    }

    this.model = new matchupModel(data)
  }
}

module.exports = Matchup