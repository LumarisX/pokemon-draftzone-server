import { nameList } from "./data.test";
import fs from "fs";
import { statsTest } from "./draft.test";

async function runTest() {
  console.log(JSON.stringify(await statsTest()));
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
