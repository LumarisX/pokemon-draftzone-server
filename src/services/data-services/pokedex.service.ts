import { Specie, SpeciesName, TypeName } from "@pkmn/data";
import { Format } from "../../data/formats";
import { getRuleset, Ruleset } from "../../data/rulesets";

const SINGLES_TIER_HIERARCHY = [
  "AG",
  "UBER",
  "OU",
  "UU",
  "RU",
  "NU",
  "PU",
  "ZU",
];

const DOUBLES_TIER_HIERARCHY = [
  "DUBER",
  "DOU",
  "DUU",
  "DRU",
  "DNU",
  "DPU",
  "DZU",
];

const TIER_ALIASES: { [tier: string]: string } = {
  UBERS: "UBER",
};

const FINAL_TIER_FALLBACKS = ["UNTIERED", "NFE"];

function normalizeTierName(tier?: string): string {
  if (!tier) return "";
  const normalized = tier
    .replace(/^\(|\)$/g, "")
    .trim()
    .toUpperCase();
  return TIER_ALIASES[normalized] ?? normalized;
}

function isTierMatch(specieTier: string, requestedTier: string): boolean {
  return (
    normalizeTierName(specieTier).toLowerCase() ===
    normalizeTierName(requestedTier).toLowerCase()
  );
}

function buildTierFallbackOrder(
  tierLabel: "tier" | "natDexTier" | "doublesTier",
  requestedTier?: string,
) {
  if (!requestedTier) return undefined;

  const normalizedRequestedTier = normalizeTierName(requestedTier);
  const fallbackOrder = [normalizedRequestedTier];

  const hierarchy =
    tierLabel === "doublesTier"
      ? DOUBLES_TIER_HIERARCHY
      : SINGLES_TIER_HIERARCHY;
  const tierIndex = hierarchy.indexOf(normalizedRequestedTier);

  if (tierIndex !== -1) {
    for (let i = tierIndex + 1; i < hierarchy.length; i++) {
      fallbackOrder.push(hierarchy[i]);
    }
  }

  for (const fallbackTier of FINAL_TIER_FALLBACKS) {
    if (!fallbackOrder.includes(fallbackTier)) fallbackOrder.push(fallbackTier);
  }

  return fallbackOrder;
}

function groupSpeciesByBaseForm(species: Specie[], ruleset: Ruleset) {
  return Object.entries(
    species.reduce(
      (formGroups, specie) => {
        const id = specie.changesFrom
          ? ruleset.species.get(specie.changesFrom)!.id
          : specie.id;
        if (!(id in formGroups)) formGroups[id] = [];
        formGroups[id].push(specie);
        return formGroups;
      },
      {} as { [key: string]: Specie[] },
    ),
  );
}

export function getSpecies(pokemonID: string): Specie | undefined {
  return getRuleset("Gen9 NatDex").species.get(pokemonID);
}

export function getName(pokemonID: string): SpeciesName | "" {
  return getSpecies(pokemonID)?.name ?? "";
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
  },
) {
  const resolvedOptions = {
    nfe: true,
    ...options,
  };

  const tierLabel: "tier" | "natDexTier" | "doublesTier" = ruleset.isNatDex
    ? "natDexTier"
    : format.layout === "2"
      ? "doublesTier"
      : "tier";

  const speciesList = Array.from(ruleset.species).filter((pokemon) => {
    if (!pokemon.exists) return false;
    if (pokemon.battleOnly) return false;
    if (resolvedOptions.nfe && pokemon.nfe) return false;
    if (
      resolvedOptions.types &&
      resolvedOptions.types.some((type) => pokemon.types.includes(type))
    )
      return false;
    return true;
  });

  const tierFallbackOrder = buildTierFallbackOrder(
    tierLabel,
    resolvedOptions.tier,
  );

  const selectedPokemon: Specie[] = [];
  const bannedIds = new Set<string>(resolvedOptions.banned);
  const selectedIds = new Set<string>();

  const pullFromGroups = (groups: [string, Specie[]][]) => {
    const availableSpecies = groups.filter(
      ([id]) => !bannedIds.has(id) && !selectedIds.has(id),
    );

    while (selectedPokemon.length < count && availableSpecies.length > 0) {
      const randIndex = Math.floor(Math.random() * availableSpecies.length);
      const specieGroup = availableSpecies[randIndex];
      const randFormIndex = Math.floor(Math.random() * specieGroup[1].length);
      selectedPokemon.push(specieGroup[1][randFormIndex]);
      selectedIds.add(specieGroup[0]);
      availableSpecies.splice(randIndex, 1);
    }
  };

  if (tierFallbackOrder) {
    for (const tier of tierFallbackOrder) {
      if (selectedPokemon.length >= count) break;
      const tierSpecies = speciesList.filter((pokemon) =>
        isTierMatch(pokemon[tierLabel], tier),
      );
      if (!tierSpecies.length) continue;
      pullFromGroups(groupSpeciesByBaseForm(tierSpecies, ruleset));
    }
  } else {
    pullFromGroups(groupSpeciesByBaseForm(speciesList, ruleset));
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
