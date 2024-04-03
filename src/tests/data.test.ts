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

export function nameList() {
  return Object.fromEntries(
    Object.entries(ruleset.gen.dex.data.Species).map(([key, specie]) => {
      let psname = specie.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (specie.baseSpecies && specie.forme) {
        psname =
          specie.baseSpecies.toLowerCase().replace(/[\s-.]+/g, "") +
          "-" +
          specie.forme.toLowerCase().replace(/[\s-.%]+/g, "");
      }
      let pdname = specie.name
        .toLowerCase()
        .replace(/[ ]/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (specie.forme) {
        pdname = pdname
          .replace("paldea", "paldean")
          .replace("alola", "alolan")
          .replace("galar", "galarian")
          .replace("hisui", "hisuian");
      }
      return [
        key,
        {
          name: specie.name,
          ps: psname,
          serebii: specie.num.toString().padStart(3, "0"),
          pd: pdname,
        },
      ];
    })
  );
}
