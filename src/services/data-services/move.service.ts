import { MoveId, Movedex } from "../../public/data/moves";

function getType(moveId: MoveId) {
  return Movedex[moveId].type.toLowerCase();
}

function getName(moveId: MoveId) {
  return Movedex[moveId].name;
}

function getCategory(moveId: MoveId) {
  if (moveId in Movedex && "category" in Movedex[moveId])
    return Movedex[moveId].category.toLowerCase();
  return null;
}

function getEffectivePower(moveId: MoveId) {
  let move = Movedex[moveId];
  let value = (move["basePower"] * move["accuracy"]) / 100;
  let flags = move["flags"];
  if ("charge" in flags || "recharge" in flags) {
    value = value / 2;
  }
  if ("condition" in move && "duration" in move["condition"]) {
    let duration = move["condition"]["duration"];
    if (duration == 1) {
      value = value / 4;
    }
    if (duration == 2) {
      value = value / 2;
    }
  }
  if ("self" in move) {
    if ("volatileStatus" in move["self"]) {
      if (move["self"]["volatileStatus"] === "lockedmove") {
        value = value / 2;
      }
    }
  }
  return value;
}

module.exports = { getType, getCategory, getName, getEffectivePower };
