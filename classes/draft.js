const Pokemon = require('./pokemon')

class Draft {

  data = {}
  errors = []
  valid = true

  constructor(formData) {
    this.data.teamName = formData.leagueName
    this.data.format = formData.format
    this.data.ruleset = formData.ruleset
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

module.exports = Draft 