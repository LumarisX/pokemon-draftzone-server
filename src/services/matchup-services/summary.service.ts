import { Stats } from "fs";
import { BaseStat, PokemonId } from "../../public/data/pokedex";
import {
  getName,
  getAbilities,
  getBaseStats,
  getTypes,
} from "../data-services/pokedex.service";
import { TypeId } from "../../public/data/typechart";

function summary(
  team: {
    pid: PokemonId;
  }[]
) {
  for (let pokemon of team) {
    summaryData(pokemon);
  }
  return { team: team, stats: statistics(team) };
}

function summaryData(pokemon: {
  pid: PokemonId;
  name?: string;
  abilities?: string[];
  types?: TypeId[];
  baseStats?: { [key in BaseStat]: number };
}) {
  pokemon.name = getName(pokemon.pid);
  pokemon.abilities = getAbilities(pokemon.pid);
  pokemon.types = getTypes(pokemon.pid);
  pokemon.baseStats = getBaseStats(pokemon.pid);
  return pokemon;
}

function statistics(
  team: {
    pid: PokemonId;
    name?: string;
    abilities?: string[];
    types?: TypeId[];
    baseStats?: { [key in BaseStat]: number };
  }[]
) {
  let stats: {
    mean: { [key in BaseStat]?: number };
    median: { [key in BaseStat]?: number };
    max: { [key in BaseStat]?: number };
  } = {
    mean: {},
    median: {},
    max: {},
  };
  let all: { [key in BaseStat]: number[] } = {
    hp: [],
    atk: [],
    def: [],
    spa: [],
    spd: [],
    spe: [],
  };
  for (let pokemon of team) {
    for (let stat in pokemon.baseStats) {
      all[stat as BaseStat].push(pokemon.baseStats[stat as BaseStat]);
    }
  }
  stats.mean = {};
  stats.median = {};
  stats.max = {};
  for (let stat in all) {
    all[stat as BaseStat].sort((a, b) => b - a);
    stats.mean[stat as BaseStat] = Math.round(
      all[stat as BaseStat].reduce((x, y) => x + y) / team.length
    );
    stats.median[stat as BaseStat] =
      all[stat as BaseStat][Math.round(all[stat as BaseStat].length / 2)];
    stats.max[stat as BaseStat] = all[stat as BaseStat][0];
  }
  return stats;
}
