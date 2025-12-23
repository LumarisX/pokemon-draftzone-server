import { Specie } from "@pkmn/data";

export function getBST(specie: Specie) {
  return Object.values(specie.baseStats).reduce((sum, stat) => stat + sum);
}

export function getCST(specie: Specie) {
  const baseStats = specie.baseStats;
  return Math.round(
    baseStats.hp +
      Math.max(baseStats.atk, baseStats.spa) +
      (baseStats.spa + baseStats.spd) / 2 +
      baseStats.spe
  );
}
