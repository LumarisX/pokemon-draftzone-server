import { Generation, Specie, SpeciesName, TypeName } from "@pkmn/data";
import { getRuleset } from "../../data/rulesets";

export function getName(pokemonID: string): SpeciesName | "" {
  return getRuleset("Gen9 NatDex").species.get(pokemonID)?.name ?? "";
}

export function getRandom(
  count: number,
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
      !pokemon.exists ||
      (options.nfe && pokemon.nfe) ||
      pokemon.forme ||
      (options.types &&
        options.types.some((type) => pokemon.types.includes(type)))
    )
      return false;
    return true;
  });
  const selected: typeof species = [];
  const usedIndices = new Set<number>();

  while (selected.length < Math.min(count, species.length)) {
    const randIndex = Math.floor(Math.random() * species.length);
    if (!usedIndices.has(randIndex)) {
      usedIndices.add(randIndex);
      const specie = species[randIndex];
      if (specie.formes) {
        const formeSpecies: Specie[] = specie.formes
          .map((name) => gen.species.get(name))
          .filter(
            (forme) =>
              forme !== undefined &&
              forme.exists &&
              !forme.battleOnly &&
              !specie.cosmeticFormes?.includes(forme.name)
          )
          .sort(() => Math.random() - 0.5) as Specie[];
        selected.push(formeSpecies[0]);
      } else {
        selected.push(specie);
      }
    }
  }
  return selected;
}
