import { PokemonId } from "../../public/data/pokedex";
import { getWeak } from "../data-services/pokedex.service";
import { defensive } from "../data-services/type.service";

export function typechart(
  team: {
    pid: PokemonId;
    name: string;
    weak?: {};
    capt?: { tera?: string[] };
  }[]
) {
  let teraTypes: { [key: string]: {} } = {};
  for (let pokemon of team) {
    pokemon.weak = getWeak(pokemon.pid);
    if (pokemon.capt && pokemon.capt.tera) {
      for (let type of pokemon.capt.tera) {
        if (!(type in teraTypes) && type != "Stellar") {
          teraTypes[type] = defensive([type]);
        }
      }
    }
  }
  return { team: team, teraTypes: teraTypes };
}
