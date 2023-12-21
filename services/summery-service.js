const pokedexService = require('./pokedex-service.js')


function summery(ateam, bteam) {
  let aOut = []
  for(let m of ateam){
    aOut.push(summeryData(m.pid));
  }
  let bOut = []
  for (let m of bteam) {
    bOut.push(summeryData(m.pid));
  }
  return [aOut, bOut]
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