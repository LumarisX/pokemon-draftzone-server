import { Generation, SpeciesName, TypeName } from "@pkmn/data";
import { getRuleset } from "../../data/rulesets";

export function getName(pokemonID: string): SpeciesName | "" {
  return getRuleset("Gen9 Natdex").species.get(pokemonID)?.name ?? "";
}

export function getRandom(
  gen: Generation,
  options: {
    types?: TypeName[];
    nfe?: boolean;
    restricted?: boolean;
    sublegends?: boolean;
    mega?: boolean;
  } = {
    nfe: true,
  }
) {
  const species = Array.from(gen.species).filter((pokemon) => {
    if (
      (options.nfe && pokemon.nfe) ||
      (options.mega && pokemon.forme === "Mega") ||
      (options.types &&
        options.types.some((type) => pokemon.types.includes(type)))
    )
      return false;
    return true;
  });
  const randInt = Math.round(Math.random() * species.length);
  return species[randInt];
}
