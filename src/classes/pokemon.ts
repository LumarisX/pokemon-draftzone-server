import { PokemonId } from "../public/data/pokedex";
import { getName, inDex } from "../services/data-services/pokedex.service";

export type Pokemon = {
  pid: PokemonId;
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

  constructor(pokemonData: {
    pid: PokemonId;
    shiny?: boolean;
    name?: string;
    capt?: {
      tera?: string[];
      z?: boolean;
    };
    captCheck?: { z: boolean; teraCheck?: { [key: string]: boolean } };
  }) {
    this.data = {
      pid: pokemonData.pid,
      name: pokemonData.name ?? getName(pokemonData.pid),
    };

    if (!inDex(pokemonData.pid)) {
      this.error = `${this.data.name} not found in the pokedex`;
      return;
    }

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
