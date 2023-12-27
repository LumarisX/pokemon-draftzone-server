const Pokemon = require('./pokemon')

class Opponent {

  data = {}
  errors = []
  valid = true

  constructor(formData) {
    this.data.teamName = formData.opponentName
    this.data.stage = formData.stage
    this.data.team = []
    for (let pokemonData of formData.team) {
      let pokemon = new Pokemon(pokemonData)
      if (pokemon.error) {
        this.errors.push(pokemon.error)
        this.valid = false
      } else {
        this.data.team.push(pokemon.data)
      }
    }
  }
}

module.exports = Opponent