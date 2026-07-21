import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ID, StatID } from "@pkmn/data";

type StatKey = StatID | "bst" | "cst";

export interface TeamStatistics {
  mean: Record<StatKey, number>;
  median: Record<StatKey, number>;
  max: Record<StatKey, number>;
  min: Record<StatKey, number>;
}

const STAT_KEYS: readonly StatID[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const ALL_STAT_KEYS = [...STAT_KEYS, "bst", "cst"] as const;

function computeStats(collections: Record<StatKey, number[]>): TeamStatistics {
  const stats: TeamStatistics = {
    mean: {} as Record<StatKey, number>,
    median: {} as Record<StatKey, number>,
    min: {} as Record<StatKey, number>,
    max: {} as Record<StatKey, number>,
  };

  for (const stat of ALL_STAT_KEYS) {
    const values = collections[stat];
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const midpoint = Math.floor(sorted.length / 2);

    stats.mean[stat] = Math.round(sum / values.length);
    stats.median[stat] =
      sorted.length % 2 === 0
        ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
        : sorted[midpoint];
    stats.min[stat] = sorted[0];
    stats.max[stat] = sorted[sorted.length - 1];
  }

  return stats;
}

function getFormeSummary(id: ID, ruleset: Ruleset) {
  const forme = PDZPokemon.tryCreate(id, ruleset);
  if (!forme) return { id, name: id };
  return {
    id,
    name: forme.name,
    types: forme.types,
    abilities: forme.getAbilities(),
    baseStats: forme.baseStats,
    bst: forme.bst,
    cst: forme.cst,
  };
}

export function summarizeTeam(
  team: PDZPokemon[],
  teamName?: string,
  coach?: string,
) {
  const collections: Record<StatKey, number[]> = {
    hp: [],
    atk: [],
    def: [],
    spa: [],
    spd: [],
    spe: [],
    bst: [],
    cst: [],
  };

  for (const pokemon of team) {
    for (const stat of STAT_KEYS) {
      collections[stat].push(pokemon.baseStats[stat]);
    }
    collections.bst.push(pokemon.bst);
    collections.cst.push(pokemon.cst);
  }

  return {
    teamName,
    coach,
    team: team.map((pokemon, index) => ({
      ...PokemonMapper.toClientPayload(pokemon),
      abilities: pokemon.getAbilities(),
      baseStats: pokemon.baseStats,
      bst: pokemon.bst,
      cst: pokemon.cst,
      index,
      types: pokemon.types,
      draftFormes: pokemon.draftFormes?.map((id) =>
        getFormeSummary(id, pokemon.ruleset),
      ),
    })),
    stats: team.length ? computeStats(collections) : undefined,
  };
}
