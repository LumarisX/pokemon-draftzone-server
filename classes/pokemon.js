const Pokedex = require('../services/pokedex-service')

class Pokemon {

  data = {}
  error;

  constructor(pokemonData) {

    if (!Pokedex.inDex(pokemonData.pokemonName)) {
      this.error = `${pokemonData.pokemonName} not found in the pokedex`
    } else {
      this.data.pid = pokemonData.pokemonName
      if (pokemonData.shiny) {
        this.data.shiny = true
      }
    }
  }
}

module.exports = Pokemon