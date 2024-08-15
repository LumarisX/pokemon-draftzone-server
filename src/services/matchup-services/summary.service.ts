import { ID, StatID } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";

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

export function summary(team: DraftSpecies[]): Summary {
  return {
    team: team.map((pokemon) => ({
      id: pokemon.id as ID,
      name: pokemon.name,
      shiny: pokemon.shiny,
      capt: pokemon.capt,
      abilities: Object.values(pokemon.abilities),
      baseStats: pokemon.baseStats,
      types: pokemon.types,
    })),
    stats: statistics(team),
  };
}

function statistics(team: DraftSpecies[]) {
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
