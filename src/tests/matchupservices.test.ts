import { ID } from "@pkmn/dex";
import { Rulesets } from "../data/rulesets";
import { PokemonData } from "../models/pokemon.schema";
import { coveragechart } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { speedchart } from "../services/matchup-services/speedchart.service";
import { summary } from "../services/matchup-services/summary.service";
import { typechart } from "../services/matchup-services/typechart.service";

const ruleset = Rulesets["Paldea Dex"];
const aTeam: PokemonData[] = [
  {
    pid: "togedemaru" as ID,
    name: "togedemaru",
    capt: { tera: ["Fire", "Ground", "Electric"] },
  },
  // { pid: "deoxys" as ID, name: "Deoxys" },
  // { pid: "ogerponcornerstone" as ID, name: "Ogerpon Cornerstone" },
];
const bTeam: PokemonData[] = [
  // { pid: "pikachu" as ID, name: "Pikachu" },
  // { pid: "gallade" as ID, name: "Gallade" },
  { pid: "heatran" as ID, name: "Heatran" },
];

export function speedchartTest() {
  return JSON.stringify(speedchart(ruleset, [aTeam, bTeam], 100));
}

function typechartTest() {
  return JSON.stringify(typechart(ruleset, aTeam));
}

function summaryTest() {
  return JSON.stringify(summary(ruleset, aTeam));
}

async function movechartTest() {
  return JSON.stringify(await movechart(ruleset, aTeam));
}

export async function coveragechartTest() {
  return JSON.stringify(await coveragechart(ruleset, aTeam, bTeam));
}

export async function matchupTests() {
  coveragechartTest();
}
