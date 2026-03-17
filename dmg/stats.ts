import type { Generation, StatsTable } from "@pkmn/data";

import { State } from "./state";
import { abs, clamp, floor, trunc } from "./math";

const LEGACY_BOOSTS = [
  25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400,
];

export function computeBoostedStat(
  stat: number,
  mod: number,
  gen?: Generation,
) {
  if (gen && gen.num <= 2) {
    return clamp(1, (stat * LEGACY_BOOSTS[mod + 6]) / 100, 999);
  }
  return floor(
    trunc(stat * (mod >= 0 ? 2 + mod : 2), 16) / (mod >= 0 ? 2 : abs(mod) + 2),
  );
}

/**
 * Compute the effective stats for a Pokémon, accounting for boosts.
 */
export function computeStats(gen: Generation, pokemon: State.Pokemon) {
  const stats = {} as StatsTable;
  if (pokemon.stats) {
    for (const stat of gen.stats) {
      stats[stat] =
        stat === "hp"
          ? pokemon.stats[stat]
          : computeBoostedStat(
              pokemon.stats[stat],
              pokemon.boosts?.[stat] || 0,
              gen,
            );
    }
    return stats;
  } else {
    for (const stat of gen.stats) {
      stats[stat] = gen.stats.calc(
        stat,
        pokemon.species.baseStats[stat],
        pokemon.ivs?.[stat] ?? 31,
        pokemon.evs?.[stat] ?? (gen.num <= 2 ? 252 : 0),
        pokemon.level,
        gen.natures.get(pokemon.nature!),
      );
      if (stat !== "hp") {
        stats[stat] = computeBoostedStat(
          stats[stat],
          pokemon.boosts?.[stat] || 0,
          gen,
        );
      }
    }
  }
  return stats;
}
