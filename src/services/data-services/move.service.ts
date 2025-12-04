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
//   return ruleset.dex.moves.getByID(moveID).type;
// }

const CRIT_KEY: number[] = [0, 1, 3, 12] as const;
const conditionalMoves = ["steelroller", "dreameater"];

export function getEffectivePower(move: Move) {
  let value =
    move.accuracy === true
      ? move.basePower
      : (move.basePower * move.accuracy) / 100;
  value *=
    !move.willCrit && move.critRatio && move.critRatio < CRIT_KEY.length
      ? 1 + (1.5 * CRIT_KEY[move.critRatio]) / 24
      : 1.5;

  if (Array.isArray(move.multihit)) {
    if (move.multihit[0] === 2 && move.multihit[1] === 5) value *= 3.3;
    else value *= (move.multihit[0] + move.multihit[1]) / 2;
  } else if (typeof move.multihit === "number" && move.multihit > 1)
    value *= move.multihit;
  if (move.condition?.duration) value /= move.condition.duration === 1 ? 4 : 2;
  if ("charge" in move.flags || "recharge" in move.flags) value *= 0.5;
  if (move.self?.volatileStatus === "lockedmove") value *= 0.5;
  if (move.mindBlownRecoil) value *= 0.5;
  if (move.id in conditionalMoves) value *= 0.1;
  if (move.selfdestruct) value *= 0.01;
  if (move.id in conditionalMoves) value /= 10;
  return value;
}
