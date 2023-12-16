const pokedex = require("../public/data/pokedex.js")["BattlePokedex"]


function getData(pokemonId) {
  return pokedex[pokemonId]
}

module.exports ={getData}
