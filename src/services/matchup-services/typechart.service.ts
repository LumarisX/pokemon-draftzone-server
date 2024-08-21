import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";

export class Typechart {
  team: (
    | PokemonData & {
        weak: { [key: string]: number };
      }
  )[];

  teraTypes: {
    [key: string]: {};
  };

  constructor(team: DraftSpecies[]) {
    this.team = team.map((pokemon) => ({
      ...pokemon.toPokemon(),
      weak: pokemon.typechart(),
    }));
    this.teraTypes = {};
    // if (pokemon.capt && pokemon.capt.tera) {
    //   pokemon.capt.tera = pokemon.capt.tera.filter((type) => type != "Stellar");
    // }
  }

  toJson() {
    return { team: this.team, teraTypes: this.teraTypes };
  }

  nextBestType() {}
}
