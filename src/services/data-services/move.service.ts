import { Move, MoveCategory, MoveName, TypeName } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";

export function getType(move: Move): TypeName {
  return move.type;
}

export function getMove(moveID: string, ruleset: Ruleset): Move {
  return ruleset.gen.dex.moves.get(moveID);
}

export function getMoveName(move: Move): MoveName {
  return move.name;
}

export function getCategory(move: Move): MoveCategory {
  return move.category;
}

export function getEffectivePower(move: Move) {
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
