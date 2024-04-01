import { Rulesets } from "../data/rulesets";
import {
  filterNames,
  getSpecies,
} from "../services/data-services/pokedex.service";

const ruleset = Rulesets["Paldea Dex"];
const natDexRuleset = Rulesets["Gen9 NatDex"];

export function testFilter() {
  return filterNames(natDexRuleset, "toge");
}

export function pokedexName() {
  const specie = getSpecies(ruleset).find(([pid, name]) => pid === "pikachu");
  return specie ? specie[1] : "";
}
