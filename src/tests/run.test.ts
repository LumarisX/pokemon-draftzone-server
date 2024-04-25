import { nameList } from "./data.test";
import fs from "fs";
import { statsTest } from "./draft.test";
import { speedchartTest } from "./matchupservices.test";

async function runTest() {
  console.log(speedchartTest());
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
