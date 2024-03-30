import { ID, toID } from "@pkmn/data";
import { Ruleset } from "../data/rulesets";
import { getName } from "../services/data-services/pokedex.service";

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
  data: Pokemon;
  error: string | undefined;

  constructor(ruleset: Ruleset, pokemonData: PokemonFormData) {
    this.data = {
      pid: toID(pokemonData.pid),
      name: getName(ruleset, pokemonData.pid),
      shiny: pokemonData.shiny,
    };

    // if (!inDex(pokemonData.pid)) {
    //   this.error = `${this.data.name} not found in the pokedex`;
    //   return;
    // }

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
