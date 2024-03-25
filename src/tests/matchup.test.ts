import { Generations } from "@pkmn/data";
import { Dex, ID } from "@pkmn/dex";
import { speedchart } from "../services/matchup-services/speedchart.service";
import { typechart } from "../services/matchup-services/typechart.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { summary } from "../services/matchup-services/summary.service";
import { Rulesets } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";

const ruleset = Rulesets["Paldea Dex"];
const aTeam: PokemonData[] = [
  {
    pid: "rotomheat" as ID,
    name: "Rotom-Heat",
    capt: { tera: ["Fire", "Ground", "Electric"] },
  },
  // { pid: "deoxys" as ID, name: "Deoxys" },
  // { pid: "ogerponcornerstone" as ID, name: "Ogerpon Cornerstone" },
];
const bTeam: PokemonData[] = [
  { pid: "pikachu" as ID, name: "Pikachu" },
  // { pid: "gallade" as ID, name: "Gallade" },
  // { pid: "heatran" as ID, name: "Heatran" },
];

function speedchartTest() {
  console.log(JSON.stringify(speedchart(ruleset, [aTeam, bTeam], 100)));
}

function typechartTest() {
  console.log(JSON.stringify(typechart(ruleset, aTeam)));
}

function summaryTest() {
  console.log(JSON.stringify(summary(ruleset, aTeam)));
}

async function movechartTest() {
  console.log(JSON.stringify(await movechart(ruleset, aTeam)));
}

async function coveragechartTest() {
  console.log(JSON.stringify(await coveragechart(ruleset, aTeam, bTeam)));
}

movechartTest();
