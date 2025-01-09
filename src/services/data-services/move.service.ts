import { Move } from "@pkmn/data";

// export function getType(
//   ruleset: Ruleset,
//   moveID: ID,
//   pokemonTypes?: [TypeName] | [TypeName, TypeName]
// ): TypeName {
//   if (pokemonTypes) {
//     if (
//       moveID === "judgment" ||
//       moveID === "multiattack" ||
//       moveID === "revelationdance"
//     ) {
//       return pokemonTypes[0];
//     } else if (moveID === "ragingbull" || moveID === "ivycudgel") {
//       return pokemonTypes[1] ? pokemonTypes[1] : pokemonTypes[0];
//     }
//   }
//   return ruleset.gen.dex.moves.getByID(moveID).type;
// }

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
  if (move.selfdestruct !== undefined) value = 1;
  return value;
}
