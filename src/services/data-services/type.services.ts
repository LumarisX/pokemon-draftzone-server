import { TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export function typeWeak(
  types: [TypeName] | [TypeName, TypeName],
  ruleset: Ruleset,
) {
  const typeNames = Object.keys(ruleset.dex.data.Types).map(
    (id) => ruleset.dex.types.get(id).name,
  );

  return typeNames.reduce(
    (acc, typeName) => {
      const immune = !ruleset.dex.getImmunity(typeName, types);
      const effectiveness = ruleset.dex.getEffectiveness(typeName, types);
      acc[typeName] = immune ? 0 : Math.pow(2, effectiveness);
      return acc;
    },
    {} as Record<TypeName, number>,
  );
}
