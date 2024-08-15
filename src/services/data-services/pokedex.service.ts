import { SpeciesName } from "@pkmn/data";
import { ID } from "@pkmn/dex-types";
import { Ruleset } from "../../data/rulesets";

export function getName(ruleset: Ruleset, pokemonID: ID): SpeciesName {
  return ruleset.gen.dex.species.getByID(pokemonID).name;
}

export function filterNames(ruleset: Ruleset, query: string) {
  if (query === "") {
    return [];
  }
  const nonstandardInfo = ruleset.natdex
    ? Object.fromEntries(
        Object.entries(ruleset.gen.dex.species).map(([key, specie]) => [
          key,
          specie.isNonstandard,
        ])
      )
    : {};
  return Object.entries(ruleset.gen.dex.data.Species)
    .filter(([key, specie]) => {
      const isNonstandard = nonstandardInfo[key] || null;
      return (
        specie.name.toLowerCase().startsWith(query.toLowerCase()) &&
        (!isNonstandard || (ruleset.natdex && isNonstandard == "Past"))
      );
    })
    .map(([key, specie]) => ({ id: key, name: specie.name }));
}
