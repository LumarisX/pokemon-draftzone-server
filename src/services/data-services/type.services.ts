import { DraftSpecies } from "../../classes/pokemon";

export function typeWeak(pokemon: DraftSpecies) {
  const conversion = [1, 2, 0.5, 0];
  let adjustedDamage: { [key: string]: number } = {};
  pokemon.types.forEach((type) => {
    const damageTaken = pokemon.ruleset.gen.dex.types.get(type).damageTaken;
    Object.keys(damageTaken).forEach((key) => {
      adjustedDamage[key] = adjustedDamage.hasOwnProperty(key)
        ? adjustedDamage[key] * conversion[damageTaken[key]]
        : conversion[damageTaken[key]];
    });
  });
  return adjustedDamage;
}
