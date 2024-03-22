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
import { damageTaken } from "./type.services";

export function getName(gen: Generation, pokemonID: ID): SpeciesName {
  return gen.dex.species.getByID(pokemonID).name;
}

export function getBaseStats(gen: Generation, pokemonID: ID): StatsTable {
  return gen.dex.species.getByID(pokemonID).baseStats;
}

export function getWeak(gen: Generation, pokemonID: PokemonId) {
  let types = Pokedex[pokemonID].types;
  let weak = damageTaken(gen, types);
  for (let a in Pokedex[pokemonID]["abilities"]) {
    let ability = Pokedex[pokemonID]["abilities"][a];
    switch (ability) {
      case "Fluffy":
        weak.fire = weak.fire * 2;
        break;
      case "Dry Skin":
        weak.fire = weak.fire * 1.25;
      case "water Absorb":
      case "Storm Drain":
        weak.water = 0;
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.electric = 0;
        break;
      case "Flash fire":
      case "Well-Baked Body":
        weak.fire = 0;
        break;
      case "Sap Sipper":
        weak.grass = 0;
        break;
      case "Levitate":
      case "Earth Eater":
        weak.ground = 0;
        break;
      case "Thick Fat":
        weak.ice = weak.ice * 0.5;
      case "Heatproof":
        weak.fire = weak.fire * 0.5;
        break;
      case "water Bubble":
        weak.fire = weak.fire * 0.5;
      case "Thermal Exchange":
      case "water Veil":
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
      case "ice Body":
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

export function getCoverage(gen: Generation, pokemonID: ID) {
  let learnset = getLearnset(gen, pokemonID);
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
  for (const move of learnset) {
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
