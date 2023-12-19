const Movedex = require("../public/data/moves")["BattleMovedex"]

function getType(moveId) {
  return Movedex[moveId].type.toLowerCase()
}

function getName(moveId){
  return Movedex[moveId].name
}

function getCategory(moveId){
  return Movedex[moveId].category.toLowerCase()
}

function getEffectivePower(moveId) {
  let move = Movedex[moveId];
  let value = move["basePower"] * move["accuracy"] / 100;
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

module.exports = { getType, getCategory, getName, getEffectivePower }