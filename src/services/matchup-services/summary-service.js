const pokedexService = require("../pokedex-service.js");

function summary(team) {
  for (let pokemon of team) {
    summaryData(pokemon);
  }
  return { team: team, stats: statistics(team) };
}

function summaryData(pokemonData) {
  pokemonData.name = pokedexService.getName(pokemonData.pid);
  pokemonData.abilities = pokedexService.getAbilities(pokemonData.pid);
  pokemonData.types = pokedexService.getTypes(pokemonData.pid);
  pokemonData.baseStats = pokedexService.getBase(pokemonData.pid);
  return pokemonData;
}

function statistics(team) {
  let stats = {};
  let all = { hp: [], atk: [], def: [], spa: [], spd: [], spe: [] };
  for (let pokemon of team) {
    for (let stat in pokemon.baseStats) {
      all[stat].push(pokemon.baseStats[stat]);
    }
  }
  stats.mean = {};
  stats.median = {};
  stats.max = {};
  for (let stat in all) {
    all[stat].sort((a, b) => b - a);
    stats.mean[stat] = Math.round(
      all[stat].reduce((x, y) => x + y) / team.length
    );
    stats.median[stat] = all[stat][Math.round(all[stat].length / 2)];
    stats.max[stat] = all[stat][0];
  }
  return stats;
}

module.exports = { summary };
