import { pokedexName } from "./data.test";

function runTest() {
  console.log(pokedexName());
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
