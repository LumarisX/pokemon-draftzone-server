import { Rulesets } from "../data/rulesets";
import { filterNames } from "../services/data-services/pokedex.service";

const ruleset = Rulesets["Paldea Dex"];
const natDexRuleset = Rulesets["Gen9 NatDex"];

export function testFilter() {
  return filterNames(natDexRuleset, "toge");
}
