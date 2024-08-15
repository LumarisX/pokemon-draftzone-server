import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";
import { getTypeChart } from "../data-services/pokedex.service";
export type Typechart = {
  team: (
    | PokemonData & {
        weak: { [key: string]: number };
      }
  )[];
  teraTypes: {
    [key: string]: {};
  };
};

export function typechart(team: DraftSpecies[]): Typechart {
  let teraTypes: { [key: string]: {} } = {};
  let result: (
    | PokemonData & {
        weak: any;
      }
  )[] = [];
  for (let p of team) {
    let pokemon: PokemonData & { weak: any } = {
      ...p,
      weak: getTypeChart(p),
    };
    if (pokemon.capt && pokemon.capt.tera) {
      for (let type of pokemon.capt.tera) {
        if (!(type in teraTypes) && type != "Stellar") {
          teraTypes[type] = [type];
        }
      }
    }
    result.push({
      id: pokemon.id,
      name: pokemon.name,
      shiny: pokemon.shiny,
      capt: pokemon.capt,
      weak: pokemon.weak,
    });
  }
  return { team: result, teraTypes: teraTypes };
}
