import { Ruleset } from "../../data/rulesets";

export function typeWeak(ruleset: Ruleset, types: string[]) {
  const conversion = [1, 2, 0.5, 0];
  let adjustedDamage: { [key: string]: number } = {};
  types.forEach((type) => {
    const damageTaken = ruleset.gen.dex.types.get(type).damageTaken;
    Object.keys(damageTaken).forEach((key) => {
      adjustedDamage[key] = adjustedDamage.hasOwnProperty(key)
        ? adjustedDamage[key] * conversion[damageTaken[key]]
        : conversion[damageTaken[key]];
    });
  });

  return adjustedDamage;
}
