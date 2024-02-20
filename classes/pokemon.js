const Pokedex = require('../services/pokedex-service')

class Pokemon {

  data = {}
  error;

  constructor(pokemonData) {
    if (!Pokedex.inDex(pokemonData.pid)) {
      this.error = `${pokemonData.name} not found in the pokedex`
    } else {
      this.data.pid = pokemonData.pid
      if (pokemonData.shiny) {
        this.data.shiny = true
      }
    }
  }
}

module.exports = Pokemon