import { Generation, ID } from "@pkmn/data";
import { BaseStat, PokemonId } from "../../data/pokedex";
import { TypeId } from "../../data/typechart";
import { PokemonData } from "../../models/pokemon.schema";
import {
  getAbilities,
  getBaseStats,
  getName,
  getTypes,
} from "../data-services/pokedex.service";

export type Summary = {
  team: PokemonData[];
  stats: {
    mean: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
    median: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
    max: {
      hp?: number | undefined;
      atk?: number | undefined;
      def?: number | undefined;
      spa?: number | undefined;
      spd?: number | undefined;
      spe?: number | undefined;
    };
  };
};

export function summary(gen: Generation, team: PokemonData[]): Summary {
  for (let pokemon of team) {
    summaryData(gen, pokemon);
  }
  return { team: team, stats: statistics(team) };
}

function summaryData(
  gen: Generation,
  pokemon: {
    pid: ID;
    name?: string;
    abilities?: string[];
    types?: TypeId[];
    baseStats?: { [key in BaseStat]: number };
  }
) {
  pokemon.name = getName(gen, pokemon.pid);
  pokemon.abilities = getAbilities(gen, pokemon.pid);
  pokemon.types = getTypes(gen, pokemon.pid);
  pokemon.baseStats = getBaseStats(gen, pokemon.pid);
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
