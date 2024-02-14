const pokedexService = require('../pokedex-service.js')

function summery(team) {
  let out = {}
  out.team = []
  for (let pokemon of team) {
    out.team.push(summeryData(pokemon));
  }
  out.stats = statistics(out.team)
  return out
}

function summeryData(pokemonData) {
  let out = {}
  out.pid = pokemonData.pid;
  out.captain = pokemonData.captain;
  out.name = pokedexService.getName(pokemonData.pid)
  out.abilities = pokedexService.getAbilities(pokemonData.pid)
  out.types = pokedexService.getTypes(pokemonData.pid)
  out.baseStats = pokedexService.getBase(pokemonData.pid)
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