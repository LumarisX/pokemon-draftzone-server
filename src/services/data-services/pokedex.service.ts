import {
  Generation,
  ID,
  SpeciesName,
  StatsTable,
  TypeName,
  toID,
} from "@pkmn/data";
import { Pokedex, PokemonId } from "../../data/pokedex";
import { getLearnset } from "./learnset.service";
import { getCategory, getEffectivePower, getType } from "./move.service";
import { typeWeak } from "./type.services";

export function getName(gen: Generation, pokemonID: ID): SpeciesName {
  return gen.dex.species.getByID(pokemonID).name;
}

export function getBaseStats(gen: Generation, pokemonID: ID): StatsTable {
  return gen.dex.species.getByID(pokemonID).baseStats;
}

export function getWeak(gen: Generation, pid: ID) {
  let types = getTypes(gen, pid);
  let weak = typeWeak(gen, types);
  for (let ability of getAbilities(gen, pid)) {
    switch (ability) {
      case "Fluffy":
        weak.Fire = weak.Fire * 2;
        break;
      case "Dry Skin":
        weak.Fire = weak.Fire * 1.25;
      case "Water Absorb":
      case "Storm Drain":
        weak.Water = 0;
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.Electric = 0;
        break;
      case "Flash Fire":
      case "Well-Baked Body":
        weak.Fire = 0;
        break;
      case "Sap Sipper":
        weak.Grass = 0;
        break;
      case "Levitate":
      case "Earth Eater":
        weak.Ground = 0;
        break;
      case "Thick Fat":
        weak.Ice = weak.Ice * 0.5;
      case "Heatproof":
        weak.Fire = weak.Fire * 0.5;
        break;
      case "Water Bubble":
        weak.Fire = weak.Fire * 0.5;
      case "Thermal Exchange":
      case "Water Veil":
        weak.brn = 0;
        break;
      case "Limber":
        weak.par = 0;
        break;
      case "Sweet Veil":
      case "Vital Spirit":
      case "Insomnia":
        weak.slp = 0;
        break;
      case "Magma Armor":
        weak.frz = 0;
        break;
      case "Purifying Salt":
        weak.ghost = weak.ghost * 0.5;
      case "Shields Down":
      case "Comatose":
        weak.brn = 0;
        weak.par = 0;
        weak.frz = 0;
        weak.slp = 0;
      case "Immunity":
      case "Pastel Veil":
        weak.psn = 0;
        weak.tox = 0;
        break;
      case "Overcoat":
        weak.powder = 0;
      case "Magic Guard":
        weak.hail = 0;
      case "Sand Force":
      case "Sand Rush":
      case "Sand Veil":
        weak.sandstorm = 0;
        break;
      case "Ice Body":
      case "Snow Cloak":
        weak.hail = 0;
        break;
    }
  }
  return weak;
}

// function filterNames(query: string): { name: string; pokemonID: ID }[] {
//   let results: { name: string; pokemonID: PokemonId }[][] = [[], []];
//   if (query === "") {
//     return [];
//   }
//   for (let mon in Pokedex) {
//     if (Pokedex[mon].tier == "CAP") {
//       continue;
//     }
//     let compare = compareString(query, Pokedex[mon].name);
//     if (compare.result && compare.pattern) {
//       results[compare.pattern].push({
//         name: Pokedex[mon].name,
//         pokemonID: mon,
//       });
//     }
//   }
//   for (let result of results) {
//     result.sort((a, b) => {
//       if (a > b) return 1;
//       if (a < b) return -1;
//       return 0;
//     });
//   }
//   return results[0].concat(results[1]);
// }

export function getBaseForme(gen: Generation, pokemonID: ID) {
  return gen.dex.species.getByID(pokemonID).baseForme;
}

export function getTypes(gen: Generation, pokemonID: ID) {
  return gen.dex.species.getByID(pokemonID).types;
}

export function getAbilities(gen: Generation, pokemonID: ID) {
  return Object.values(gen.dex.species.getByID(pokemonID).abilities);
}

export async function getCoverage(gen: Generation, pokemonID: ID) {
  let learnset = await getLearnset(gen, pokemonID);
  console.log(pokemonID, learnset);
  let coverage: {
    Physical: {
      [key: string]: {
        ePower: number;
        id: ID;
        type: string;
        stab: boolean;
      };
    };
    Special: {
      [key: string]: {
        ePower: number;
        id: ID;
        type: string;
        stab: boolean;
      };
    };
  } = { Physical: {}, Special: {} };
  for (const move in learnset) {
    let moveID = toID(move);
    const category = getCategory(gen, moveID);
    let type = getType(gen, moveID);
    type = type.charAt(0).toUpperCase() + type.slice(1);
    if (category !== "Status") {
      const ePower = getEffectivePower(gen, moveID);
      if (
        !(type in coverage[category]) ||
        coverage[category][type].ePower < ePower
      ) {
        coverage[category][type] = {
          id: moveID,
          ePower: ePower,
          type: type,
          stab: getTypes(gen, pokemonID).includes(type as TypeName),
        };
      }
    }
    ``;
  }
  return {
    physical: Object.values(coverage.Physical),
    special: Object.values(coverage.Special),
  };
}

export function needsItem(gen: Generation, pokemonID: ID) {
  return gen.dex.species.getByID(pokemonID).requiredItem;
}
