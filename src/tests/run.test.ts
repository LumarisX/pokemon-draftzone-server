import { Generations } from "@pkmn/data";
import { testFilter } from "./data.test";
import { speedchartTest } from "./matchupservices.test";
import { Dex } from "@pkmn/dex";
import { Pokemon } from "@smogon/calc";

const startTime = performance.now();
console.log(speedchartTest());

// const gens = new Generations(Dex);

// console.log(new Pokemon(gens.get(9).num, "Togedemaru"));

console.log("Elapsed time:", performance.now() - startTime, "milliseconds");
// togedemaru
