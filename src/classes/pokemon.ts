import { ID, Specie } from "@pkmn/data";
import { Ruleset } from "../data/rulesets";

export type PokemonFormData = {
  pid: ID;
  shiny?: boolean;
  name?: string;
  capt?: {
    tera?: { [key: string]: boolean };
    z?: boolean;
    teraCheck: boolean;
  };
  captCheck?: boolean;
};

export type Pokemon = {
  pid: ID;
  shiny?: boolean;
  name: string;
  capt?: {
    tera?: string[];
    z?: boolean;
  };
};

export class PokemonBuilder {
  data: Specie & { shiny?: boolean };
  error: string | undefined;

  constructor(ruleset: Ruleset, pokemonData: PokemonFormData) {
    let pokemon = ruleset.gen.species.get(pokemonData.pid);
    if (!pokemon) {
      this.error = `${pokemonData.pid} not found in the pokedex`;
      return;
    }
    this.data = {
      ...pokemon,
      shiny: pokemonData.shiny,
    };
    const { captCheck } = pokemonData;
    if (captCheck) {
      this.data.capt = {
        z: pokemonData.capt?.z ? true : undefined,
        tera: pokemonData.capt?.teraCheck
          ? Object.keys(pokemonData.capt?.tera || {}).filter(
              (type) => pokemonData.capt!.tera![type]
            )
          : undefined,
      };
    }
  }
}
