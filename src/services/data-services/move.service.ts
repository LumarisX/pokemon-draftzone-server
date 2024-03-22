import { Generation, ID, MoveCategory, MoveName, TypeName } from "@pkmn/data";
import { MoveId, Movedex } from "../../data/moves";

export function getType(gen: Generation, moveID: ID): TypeName {
  return gen.dex.moves.getByID(moveID).type;
}

export function getName(gen: Generation, moveID: ID): MoveName {
  return gen.dex.moves.getByID(moveID).name;
}

export function getCategory(gen: Generation, moveID: ID): MoveCategory {
  return gen.dex.moves.getByID(moveID).category;
}

export function getEffectivePower(gen: Generation, moveID: ID) {
  const move = gen.dex.moves.getByID(moveID);
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
  return value;
}
