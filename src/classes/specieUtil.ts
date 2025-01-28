import { Specie } from "@pkmn/data";

export function getBst(specie: Specie) {
  return Object.values(specie.baseStats).reduce((sum, stat) => stat + sum);
}
