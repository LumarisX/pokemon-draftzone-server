import { Generation, SpeciesName, TypeName } from "@pkmn/data";
import { natdexGens } from "../../data/rulesets";

export function getName(pokemonID: string): SpeciesName {
  return natdexGens.dex.species.get(pokemonID).name;
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

// export function filterNames(ruleset: Ruleset, query: string) {
//   if (query === "") {
//     return [];
//   }
//   const nonstandardInfo = ruleset.natdex
//     ? Object.fromEntries(
//         Object.entries(ruleset.gen.dex.species).map(([key, specie]) => [
//           key,
//           specie.isNonstandard,
//         ])
//       )
//     : {};
//   return Object.entries(ruleset.gen.dex.data.Species)
//     .filter(([key, specie]) => {
//       const isNonstandard = nonstandardInfo[key] || null;
//       return (
//         specie.name.toLowerCase().startsWith(query.toLowerCase()) &&
//         (!isNonstandard || (ruleset.natdex && isNonstandard == "Past"))
//       );
//     })
//     .map(([key, specie]) => ({ id: key, name: specie.name }));
// }
