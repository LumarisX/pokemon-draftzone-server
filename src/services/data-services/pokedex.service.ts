import { ID, SpeciesName, StatsTable, TypeName, toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { getLearnset } from "./learnset.service";
import { getCategory, getEffectivePower, getType } from "./move.service";
import { typeWeak } from "./type.services";
import { PokemonData } from "../../models/pokemon.schema";

export function getName(ruleset: Ruleset, pokemonID: ID): SpeciesName {
  return ruleset.gen.dex.species.getByID(pokemonID).name;
}

export function getBaseStats(ruleset: Ruleset, pokemonID: ID): StatsTable {
  return ruleset.gen.dex.species.getByID(pokemonID).baseStats;
}

export function getWeak(ruleset: Ruleset, pid: ID): { [key: string]: number } {
  let types = getTypes(ruleset, pid);
  let weak = typeWeak(ruleset, types);
  for (let ability of getAbilities(ruleset, pid)) {
    switch (ability) {
      case "Fluffy":
        weak.Fire *= 2;
        break;
      case "Dry Skin":
        weak.Fire *= 1.25;
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
        weak.Ice *= 0.5;
      case "Heatproof":
        weak.Fire *= 0.5;
        break;
      case "Water Bubble":
        weak.Fire *= 0.5;
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
        weak.Ghost *= 0.5;
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

export function getBaseForme(ruleset: Ruleset, pokemonID: ID) {
  return ruleset.gen.dex.species.getByID(pokemonID).baseForme;
}

export function getTypes(ruleset: Ruleset, pokemonID: ID) {
  return ruleset.gen.dex.species.getByID(pokemonID).types;
}

export function getAbilities(ruleset: Ruleset, pokemonID: ID) {
  return Object.values(ruleset.gen.dex.species.getByID(pokemonID).abilities);
}

export async function getCoverage(ruleset: Ruleset, pokemon: PokemonData) {
  let learnset = await getLearnset(ruleset, pokemon.pid);
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
    teraBlast?: true;
  } = { Physical: {}, Special: {} };
  if (learnset.terablast && pokemon.capt?.tera) {
    for (const type of pokemon.capt.tera) {
      coverage.Physical[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: getTypes(ruleset, pokemon.pid).includes(type as TypeName),
      };
      coverage.Special[type] = {
        id: "terablast" as ID,
        ePower: -1,
        type: type,
        stab: getTypes(ruleset, pokemon.pid).includes(type as TypeName),
      };
    }
  }
  for (const move in learnset) {
    let moveID = toID(move);
    const category = getCategory(ruleset, moveID);
    let type = getType(ruleset, moveID);
    if (category !== "Status") {
      const ePower = getEffectivePower(ruleset, moveID);
      if (
        !(type in coverage[category]) ||
        coverage[category][type].ePower < ePower
      ) {
        coverage[category][type] = {
          id: moveID,
          ePower: ePower,
          type: type,
          stab: getTypes(ruleset, pokemon.pid).includes(type as TypeName),
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

export function needsItem(ruleset: Ruleset, pokemonID: ID) {
  return ruleset.gen.dex.species.getByID(pokemonID).requiredItem;
}
