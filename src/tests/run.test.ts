import { nameList } from "./data.test";
import fs from "fs";
import { statsTest } from "./draft.test";

async function runTest() {
  // console.log(JSON.stringify(await nameList()));
  fs.writeFile(
    "output.txt",
    `export const BattlePokedex: {
    [key: string]: {
      name: string;
      ps: string;
      serebii: string;
      pd: string;
    };
  } = ` + JSON.stringify(nameList()),
    (err) => {
      if (err) {
        console.error(err);
      } else {
        // file written successfully
      }
    }
  );
}
const startTime = performance.now();
runTest();
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log(`${elapsedTime} milliseconds elapsed.`);
