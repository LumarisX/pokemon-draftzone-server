import { Generation } from "@pkmn/data";

export function typeWeak(gen: Generation, types: string[]) {
  const conversion = [1, 2, 0.5, 0];
  let adjustedDamage: { [key: string]: number } = {};
  types.forEach((type) => {
    const damageTaken = gen.dex.types.get(type).damageTaken;
    Object.keys(damageTaken).forEach((key) => {
      adjustedDamage[key] = adjustedDamage[key]
        ? adjustedDamage[key] * conversion[damageTaken[key]]
        : conversion[damageTaken[key]];
    });
  });

  return adjustedDamage;
}
