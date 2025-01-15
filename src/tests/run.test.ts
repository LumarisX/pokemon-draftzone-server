import { calculate, Field, Move, Pokemon } from "@smogon/calc";
import { testSet } from "../services/pats-services/test-set";
import { ReplayAnalysis } from "../services/replay-services/replay-analyze.service";

// const results: { [key: string]: number }[] = [];

async function testReplay() {
  const response = await fetch(
    "https://replay.pokemonshowdown.com/gen9doublescustomgame-2227018912.log"
  );
  const text = await response.text();
  const replayData = new ReplayAnalysis(text);
  const analysis = replayData.analyze();
  //   console.log(analysis);
}

testReplay();
// const TRIALS = 10000000;
// let avg = 0;

// for (let B = 1; B <= TRIALS; B++) {
//   let sum = 0;
//   for (let n = 0.85; n <= 1; n += 0.01) {
//     sum += Math.floor(B * n) / 16;
//   }
//   const m = Math.floor(B * 1.85);
//   const max = m / 2;
//   const lower = (m - 1) / 2;
//   (avg += sum - lower),
//     results.push({
//       B,
//       max,
//       sum,
//       lower: lower,
//     });
// }

// console.log(
//   avg / TRIALS
// );

// testSet(
//   new Pokemon(9, "Primarina", {
//     item: "Throat Spray",
//     ability: "Liquid Voice",
//     level: 50,
//     moves: ["Moonblast", "Icy Wind"],
//     evs: {
//       hp: 252,
//       spa: 252,
//       spe: 4,
//     },
//     nature: "Serious",
//   }),
//   "Archaludon",
//   new Field({ gameType: "Doubles" })
// );

// const result = calculate(
//   9,
//   new Pokemon(9, "Primarina", {
//     item: "Throat Spray",
//     ability: "Liquid Voice",
//     level: 50,
//     evs: {
//       hp: 252,
//       spa: 252,
//       spe: 4,
//     },
//     nature: "Serious",
//   }),
//   new Pokemon(9, "Archaludon", {
//     item: "Assault Vest",
//     ability: "Stamina",
//     level: 50,
//     evs: {
//       hp: 252,
//       spd: 4,
//     },
//     nature: "Serious",
//   }),
//   new Move(9, "Moonblast"),
//   new Field({ gameType: "Doubles" })
// );

// console.log(result.fullDesc());

// generateDarkColorScale(0x353e4a, 21)
//   .reverse()
//   .forEach((rgb, index) => {
//     console.log(`${index * 50}: '${rgbToHexString(rgb)}',`);
//   });

// speedTiers();
