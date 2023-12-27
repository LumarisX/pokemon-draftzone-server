const Pokemon = require('./pokemon')
const DraftModel = require("../models/draftModel");

class Draft {

  model = null
  errors = []
  valid = true

  constructor(formData, user_id) {
    let data = {}
    data.leagueName = formData.leagueName
    data.leagueId = formData.leagueName.toLowerCase().replace(/\W/gi,'')
    data.format = formData.format
    data.ruleset = formData.ruleset
    data.owner = user_id
    data.team = []
    for (let pokemonData of formData.team) {
      let pokemon = new Pokemon(pokemonData)
      if (pokemon.error) {
        this.errors.push(pokemon.error)
        this.valid = false
      } else {
        data.team.push(pokemon.data)
      }
    }
    this.model = new DraftModel(data)
  }
}

module.exports = Draft 