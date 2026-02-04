import { TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export function typeWeak(
  types: [TypeName] | [TypeName, TypeName],
  ruleset: Ruleset,
) {
  return Array.from(ruleset.types).reduce(
    (acc, type) => {
      acc[type.name] = type.totalEffectiveness(types);
      return acc;
    },
    {} as Record<TypeName, number>,
  );
}
