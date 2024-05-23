import { recommendedTest } from "./finder.test";

async function runTest() {
  recommendedTest();
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
