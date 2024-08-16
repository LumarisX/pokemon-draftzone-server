import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";
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
  let teamTypes = team.map((pokemon) => ({
    ...pokemon.toPokemon(),
    weak: pokemon.typechart(),
  }));
  // if (pokemon.capt && pokemon.capt.tera) {
  //   pokemon.capt.tera = pokemon.capt.tera.filter((type) => type != "Stellar");
  // }
  return { team: teamTypes, teraTypes: {} };
}
