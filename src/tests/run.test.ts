import { testFilter } from "./data.test";

const startTime = performance.now();
console.log(testFilter());
const endTime = performance.now();
const elapsedTime = endTime - startTime;
console.log("Elapsed time:", elapsedTime, "milliseconds");
