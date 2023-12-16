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
  let data = pokedexService.getData(pokemonData)
  out.pid = pokemonData;
  out.name = data.name;
  out.abilities = data.abilities;
  out.types = data.types;
  out.baseStats = data.baseStats;
  return out;
}

module.exports = {summery}