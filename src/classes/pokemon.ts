import { Generation, ID } from "@pkmn/data";
import { getName } from "../services/data-services/pokedex.service";
import { Ruleset } from "../data/rulesets";

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

  constructor(
    ruleset: Ruleset,
    pokemonData: {
      pid: ID;
      shiny?: boolean;
      name?: string;
      capt?: {
        tera?: string[];
        z?: boolean;
      };
      captCheck?: { z: boolean; teraCheck?: { [key: string]: boolean } };
    }
  ) {
    this.data = {
      pid: pokemonData.pid,
      name: pokemonData.name ?? getName(ruleset, pokemonData.pid),
    };

    // if (!inDex(pokemonData.pid)) {
    //   this.error = `${this.data.name} not found in the pokedex`;
    //   return;
    // }

    const { captCheck } = pokemonData;
    if (captCheck?.z) {
      this.data.capt = {
        z: true,
        tera: Object.keys(captCheck.teraCheck || {}).filter(
          (type) => captCheck.teraCheck![type]
        ),
      };
    }
  }
}
