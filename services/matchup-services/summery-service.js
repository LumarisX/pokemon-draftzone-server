const pokedexService = require('../pokedex-service.js')

function summery(ateam, bteam) {
  let aOut = {}
  aOut.team = []
  for (let m of ateam) {
    aOut.team.push(summeryData(m.pid));
  }
  aOut.stats = statistics(aOut.team)
  let bOut = {}
  bOut.team = []
  for (let m of bteam) {
    bOut.team.push(summeryData(m.pid));
  }
  bOut.stats = statistics(bOut.team)
  return [aOut, bOut]
}

function summeryData(pokemonData) {
  let out = {}
  out.pid = pokemonData;
  out.name = pokedexService.getName(pokemonData)
  out.abilities = pokedexService.getAbilities(pokemonData)
  out.types = pokedexService.getTypes(pokemonData)
  out.baseStats = pokedexService.getBase(pokemonData)
  return out;
}

function statistics(team) {
  let stats = {}
  let all = { hp: [], atk: [], def: [], spa: [], spd: [], spe: [] }
  for (let pokemon of team) {
    for (let stat in pokemon.baseStats) {
      all[stat].push(pokemon.baseStats[stat])
    }
  }
  stats.mean = {}
  stats.median = {}
  stats.max = {}
  for (let stat in all) {
    all[stat].sort((a, b) => b - a)
    stats.mean[stat] = Math.round(all[stat].reduce((x, y) => x + y) / team.length)
    stats.median[stat] = all[stat][Math.round(all[stat].length / 2)]
    stats.max[stat] = all[stat][0]
  }
  return stats
}

module.exports = { summery }