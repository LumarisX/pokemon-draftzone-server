import { ID, StatID, TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
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

export function summary(ruleset: Ruleset, team: PokemonData[]): Summary {
  for (let pokemon of team) {
    summaryData(ruleset, pokemon);
  }
  return { team: team, stats: statistics(team) };
}

function summaryData(
  ruleset: Ruleset,
  pokemon: {
    id: ID;
    name?: string;
    abilities?: string[];
    types?: TypeName[];
    baseStats?: { [key in StatID]: number };
  }
) {
  pokemon.name = getName(ruleset, pokemon.id);
  pokemon.abilities = getAbilities(ruleset, pokemon.id);
  pokemon.types = getTypes(ruleset, pokemon.id);
  pokemon.baseStats = getBaseStats(ruleset, pokemon.id);
  return pokemon;
}

function statistics(
  team: {
    id: ID;
    name?: string;
    abilities?: string[];
    types?: TypeName[];
    baseStats?: { [key in StatID]: number };
  }[]
) {
  let stats: {
    mean: { [key in StatID]?: number };
    median: { [key in StatID]?: number };
    max: { [key in StatID]?: number };
  } = {
    mean: {},
    median: {},
    max: {},
  };
  let all: { [key in StatID]: number[] } = {
    hp: [],
    atk: [],
    def: [],
    spa: [],
    spd: [],
    spe: [],
  };
  team.forEach((pokemon) => {
    Object.keys(all).forEach((statKey: string) => {
      const stat = statKey as StatID;
      if (pokemon.baseStats && pokemon.baseStats[stat]) {
        all[stat].push(pokemon.baseStats[stat]);
      }
    });
  });
  Object.keys(all).forEach((statKey: string) => {
    const stat = statKey as StatID;
    all[stat].sort((a, b) => b - a);
    stats.mean[stat] = Math.round(
      all[stat].reduce((x, y) => x + y, 0) / team.length
    );
    stats.median[stat] = all[stat][Math.round(all[stat].length / 2)];
    stats.max[stat] = all[stat][0];
  });

  return stats;
}
