import { BaseStat, PokemonId } from "../../data/pokedex";
import { TypeId } from "../../data/typechart";
import { PokemonData } from "../../models/pokemon.schema";
import {
  getAbilities,
  getBaseStats,
  getName,
  getTypes,
} from "../data-services/pokedex.service";

export function summary(team: PokemonData[]) {
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
  team.forEach((pokemon) => {
    Object.keys(all).forEach((statKey: string) => {
      const stat = statKey as BaseStat;
      if (pokemon.baseStats && pokemon.baseStats[stat]) {
        all[stat].push(pokemon.baseStats[stat]);
      }
    });
  });
  Object.keys(all).forEach((statKey: string) => {
    const stat = statKey as BaseStat;
    all[stat].sort((a, b) => b - a);
    stats.mean[stat] = Math.round(
      all[stat].reduce((x, y) => x + y, 0) / team.length
    );
    stats.median[stat] = all[stat][Math.round(all[stat].length / 2)];
    stats.max[stat] = all[stat][0];
  });

  return stats;
}
