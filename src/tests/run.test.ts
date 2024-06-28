import { Replay } from "../services/analyze-services/replay-analyze.service";

async function runTest() {
  const response = await fetch(
    "https://replay.pokemonshowdown.com/gen9natdexdraft-2151165262.log"
  );
  let replay = new Replay(await response.text());
  replay.analyze();
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
