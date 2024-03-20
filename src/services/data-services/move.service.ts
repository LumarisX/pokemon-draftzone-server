import { MoveId, Movedex } from "../../public/data/moves";

export function getType(moveId: MoveId) {
  return Movedex[moveId].type;
}

function getName(moveId: MoveId) {
  return Movedex[moveId].name;
}

export function getCategory(moveId: MoveId) {
  return Movedex[moveId].category;
}

export function getEffectivePower(moveId: MoveId) {
  const move = Movedex[moveId];
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
