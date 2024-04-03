import { nameList, pokedexName } from "./data.test";
import fs from "fs";

function runTest() {
  const data = JSON.stringify(nameList());
  fs.writeFileSync("output.json", data); // Write data to output.json file
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
