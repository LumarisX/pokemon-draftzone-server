import { DraftSpecies } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";
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

export function typechart(ruleset: Ruleset, team: DraftSpecies[]): Typechart {
  let teraTypes: { [key: string]: {} } = {};
  let result: (
    | PokemonData & {
        weak: any;
      }
  )[] = [];
  for (let p of team) {
    let pokemon: PokemonData & { weak: any } = {
      ...p,
      weak: getTypeChart(ruleset, p),
    };
    result.push(pokemon);
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
