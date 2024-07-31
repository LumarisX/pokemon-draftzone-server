import { Specie } from "@pkmn/data";

export function typeWeak(mon: Specie) {
  const conversion = [1, 2, 0.5, 0];
  let adjustedDamage: { [key: string]: number } = {};
  mon.types.forEach((type) => {
    const damageTaken = mon.dex.types.get(type).damageTaken;
    Object.keys(damageTaken).forEach((key) => {
      adjustedDamage[key] = adjustedDamage.hasOwnProperty(key)
        ? adjustedDamage[key] * conversion[damageTaken[key]]
        : conversion[damageTaken[key]];
    });
  });
  return adjustedDamage;
}
