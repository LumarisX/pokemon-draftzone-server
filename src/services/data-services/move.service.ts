import { ID, Move, MoveCategory, MoveName, TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export function getType(
  ruleset: Ruleset,
  moveID: ID,
  pokemonTypes?: [TypeName] | [TypeName, TypeName]
): TypeName {
  if (pokemonTypes) {
    if (
      moveID === "judgment" ||
      moveID === "multiattack" ||
      moveID === "revelationdance"
    ) {
      return pokemonTypes[0];
    } else if (moveID === "ragingbull" || moveID === "ivycudgel") {
      return pokemonTypes[1] ? pokemonTypes[1] : pokemonTypes[0];
    }
  }
  return ruleset.gen.dex.moves.getByID(moveID).type;
}

export function getMove(ruleset: Ruleset, moveID: ID): Move {
  return ruleset.gen.dex.moves.getByID(moveID);
}

export function getMoveName(ruleset: Ruleset, moveID: ID): MoveName {
  return ruleset.gen.dex.moves.getByID(moveID).name;
}

export function getCategory(ruleset: Ruleset, moveID: ID): MoveCategory {
  return ruleset.gen.dex.moves.getByID(moveID).category;
}

export function getEffectivePower(ruleset: Ruleset, moveID: ID) {
  const move = ruleset.gen.dex.moves.getByID(moveID);
  let value =
    move.accuracy === true
      ? move.basePower
      : (move.basePower * move.accuracy) / 100;
  const flags = move.flags;
  if ("charge" in flags || "recharge" in flags) {
    value /= 2;
  }
  const condition = move.condition;
  if (condition?.duration) {
    const duration = condition.duration;
    value /= duration === 1 ? 4 : 2;
  }
  if (move.self?.volatileStatus === "lockedmove") {
    value /= 2;
  }
  if (move.id === "steelroller") {
    value = 1;
  }
  return value;
}
