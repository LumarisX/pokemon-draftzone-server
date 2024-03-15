const Pokedex = require("../services/pokedex-service");

class Pokemon {
  data = {};
  error;

  constructor(pokemonData) {
    if (!Pokedex.inDex(pokemonData.pid)) {
      this.error = `${pokemonData.name} not found in the pokedex`;
    } else {
      this.data.pid = pokemonData.pid;
      this.data.name = Pokedex.getName(pokemonData.pid);
      if (pokemonData.shiny) {
        this.data.shiny = true;
      }
      if (pokemonData.captCheck) {
        this.data.capt = {};
        if (pokemonData.capt.z) {
          this.data.capt.z = pokemonData.capt.z;
        }
        if (pokemonData.capt.teraCheck) {
          this.data.capt.tera = [];
          for (let type in pokemonData.capt.tera) {
            if (pokemonData.capt.tera[type]) {
              this.data.capt.tera.push(type);
            }
          }
        }
      }
    }
  }
}

module.exports = Pokemon;
