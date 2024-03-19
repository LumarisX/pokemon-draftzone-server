import { Pokedex, PokemonId } from "../public/data/pokedex";

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
  data: Pokemon = {
    pid: "",
    name: "",
  };
  error;
  constructor(pokemonData: {
    pid: any;
    shiny: any;
    name: any;
    capt: any;
    captCheck?: any;
  }) {
    if (!inDex(pokemonData.pid)) {
      this.error = `${pokemonData.name} not found in the pokedex`;
    } else {
      this.data.pid = pokemonData.pid;
      this.data.name = Pokedex.getName(pokemonData.pid);
      if (pokemonData.shiny) {
        this.data.shiny = true;
      }
      if (pokemonData.captCheck) {
        this.data.capt = {};
        if (pokemonData.capt.z) {
          this.data.capt.z = pokemonData.capt.z;
        }
        if (pokemonData.capt.teraCheck) {
          this.data.capt.tera = [];
          for (let type in pokemonData.capt.tera) {
            if (pokemonData.capt.tera[type]) {
              this.data.capt.tera.push(type);
            }
          }
        }
      }
    }
  }
}
