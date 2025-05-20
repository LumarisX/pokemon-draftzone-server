import { Specie, SpeciesName, TypeName } from "@pkmn/data";
import { Format } from "../../data/formats";
import { getRuleset, Ruleset } from "../../data/rulesets";

export function getName(pokemonID: string): SpeciesName | "" {
  return getRuleset("Gen9 NatDex").species.get(pokemonID)?.name ?? "";
}

export function getRandom(
  count: number,
  ruleset: Ruleset,
  format: Format,
  options: Partial<{
    types: TypeName[];
    nfe: boolean;
    restricted: boolean;
    sublegends: boolean;
    mega: boolean;
    tier: string;
    banned: string[];
  }> = {
    nfe: true,
  }
) {
  const tierLabel: "tier" | "natDexTier" | "doublesTier" = ruleset.isNatDex
    ? "natDexTier"
    : format.layout === "2"
    ? "doublesTier"
    : "tier";

  const eligibleSpecies = Object.entries(
    Array.from(ruleset.species)
      .filter((pokemon) => {
        if (!pokemon.exists) return false;
        if (pokemon.battleOnly) return false;
        if (options.nfe && pokemon.nfe) return false;
        if (
          options.types &&
          options.types.some((type) => pokemon.types.includes(type))
        )
          return false;
        if (
          options.tier &&
          !(
            pokemon.tier === options.tier ||
            pokemon[tierLabel] === `(${options.tier})`
          )
        )
          return false;
        return true;
      })
      .reduce((formGroups, specie) => {
        const id = specie.changesFrom
          ? ruleset.species.get(specie.changesFrom)!.id
          : specie.id;
        if (!(id in formGroups)) formGroups[id] = [];
        formGroups[id].push(specie);
        return formGroups;
      }, {} as { [key: string]: Specie[] })
  );

  const selectedPokemon: Specie[] = [];
  const bannedIds = new Set<string>(options.banned);
  const availableSpecies = [...eligibleSpecies];

  while (
    selectedPokemon.length < Math.min(count, eligibleSpecies.length) &&
    availableSpecies.length > 0
  ) {
    const randIndex = Math.floor(Math.random() * availableSpecies.length);
    const specieGroup = availableSpecies[randIndex];
    if (!bannedIds.has(specieGroup[0])) {
      const randFormIndex = Math.floor(Math.random() * specieGroup[1].length);
      selectedPokemon.push(specieGroup[1][randFormIndex]);
      availableSpecies.splice(randIndex, 1);
    } else {
      availableSpecies.splice(randIndex, 1);
    }
  }
  return selectedPokemon.map((pokemon) => ({
    id: pokemon.id,
    name: pokemon.name,
    tier: pokemon[tierLabel],
    types: pokemon.types,
    baseStats: pokemon.baseStats,
    abilities: Object.values(pokemon.abilities),
  }));
}
