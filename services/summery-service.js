const pokedexService = require('./pokedex-service.js')


function summery(ateam, bteam) {
  let out = {blueTeam: [], redTeam: []}
  for(let m of ateam){
    out.blueTeam.push(summeryData(m.pid));
  }
  for (let m of bteam) {
    out.redTeam.push(summeryData(m.pid));
  }
  return out
}

function summeryData(pokemonData) {
  let out = {}
  out.pid = pokemonData;
  out.name = pokedexService.getName(pokemonData)
  out.abilities = pokedexService.getAbilities(pokemonData)
  out.types = pokedexService.getTypes(pokemonData)
  out.baseStats =pokedexService.getBase(pokemonData)
  return out;
}

module.exports = {summery}