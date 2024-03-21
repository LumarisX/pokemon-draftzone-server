import { DamageTypes } from "../../data/typechart";
import { PokemonData } from "../../models/pokemon.schema";
import { getWeak } from "../data-services/pokedex.service";
import { defensive } from "../data-services/type.service";

export type Typechart = {
  team: (
    | PokemonData & {
        weak: DamageTypes;
      }
  )[];
  teraTypes: {
    [key: string]: {};
  };
};

export function typechart(team: PokemonData[]): Typechart {
  let teraTypes: { [key: string]: {} } = {};
  let result: (
    | PokemonData & {
        weak: DamageTypes;
      }
  )[] = [];
  for (let p of team) {
    let pokemon: PokemonData & { weak: DamageTypes } = {
      ...p,
      weak: getWeak(p.pid),
    };
    if (pokemon.capt && pokemon.capt.tera) {
      for (let type of pokemon.capt.tera) {
        if (!(type in teraTypes) && type != "Stellar") {
          teraTypes[type] = defensive([type]);
        }
      }
    }
  }
  return { team: result, teraTypes: teraTypes };
}
