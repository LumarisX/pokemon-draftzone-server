import { Generations } from "@pkmn/data";
import { Dex, ID } from "@pkmn/dex";
import { speedchart } from "../services/matchup-services/speedchart.service";
import { typechart } from "../services/matchup-services/typechart.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { summary } from "../services/matchup-services/summary.service";

const gens = new Generations(Dex);
const gen = gens.get(9);
const aTeam = [
  // { pid: "charmander" as ID, name: "Charmander" },
  { pid: "charizard" as ID, name: "Charizard" },

  // { pid: "deoxys" as ID, name: "Deoxys" },
  // { pid: "ogerponcornerstone" as ID, name: "Ogerpon Cornerstone" },
];
const bTeam = [
  { pid: "pikachu" as ID, name: "Pikachu" },
  // { pid: "gallade" as ID, name: "Gallade" },
  { pid: "heatran" as ID, name: "Heatran" },
];

function speedchartTest() {
  console.log(JSON.stringify(speedchart(gen, [aTeam, bTeam], 100)));
}

function typechartTest() {
  console.log(JSON.stringify(typechart(gen, aTeam)));
}

function summaryTest() {
  console.log(JSON.stringify(summary(gen, aTeam)));
}

async function movechartTest() {
  console.log(JSON.stringify(await movechart(gen, aTeam)));
}

async function coveragechartTest() {
  console.log(JSON.stringify(await coveragechart(gen, aTeam, bTeam)));
}

coveragechartTest();
