import { Pokedex, PokemonId } from "../../public/data/pokedex";

export function getName(pid: PokemonId): string {
  return Pokedex[pid]["name"];
}
