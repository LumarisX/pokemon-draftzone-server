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
  let move = Movedex[moveId];
  let value;
  if (move["accuracy"] === true) {
    value = move["basePower"];
  } else {
    value = (move["basePower"] * move["accuracy"]) / 100;
  }
  let flags = move["flags"];
  if ("charge" in flags || "recharge" in flags) {
    value = value / 2;
  }
  if (move["condition"] && "duration" in move["condition"]) {
    let duration = move["condition"]["duration"];
    if (duration == 1) {
      value = value / 4;
    }
    if (duration == 2) {
      value = value / 2;
    }
  }
  if (
    move["self"] &&
    move["self"]["volatileStatus"] &&
    move["self"]["volatileStatus"] === "lockedmove"
  ) {
    value = value / 2;
  }
  return value;
}
