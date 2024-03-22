import { Generation } from "@pkmn/data";
import { DamageTypes } from "../../data/typechart";
import { PokemonData } from "../../models/pokemon.schema";
import { getTypes } from "../data-services/pokedex.service";
import { damageTaken } from "../data-services/type.services";
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

export function typechart(gen: Generation, team: PokemonData[]): Typechart {
  let teraTypes: { [key: string]: {} } = {};
  let result: (
    | PokemonData & {
        weak: any;
      }
  )[] = [];
  for (let p of team) {
    let pokemon: PokemonData & { weak: any } = {
      ...p,
      weak: damageTaken(gen, getTypes(gen, p.pid)),
    };
    if (pokemon.capt && pokemon.capt.tera) {
      for (let type of pokemon.capt.tera) {
        if (!(type in teraTypes) && type != "Stellar") {
          teraTypes[type] = [type];
        }
      }
    }
  }
  return { team: result, teraTypes: teraTypes };
}
