import { MoveId } from "../../public/data/moves";
import { Pokedex, PokemonId, BaseStat } from "../../public/data/pokedex";
import { compareString } from "../filter.service";
import {
  hasLearnset,
  inLearnset,
  getLearnset as LearnsetgetLearnset,
} from "./learnset.service";
import { getCategory, getEffectivePower, getType } from "./move.service";
import { defensive } from "./type.service";

export function inDex(pid: PokemonId) {
  return pid in Pokedex;
}

export function getName(pid: PokemonId) {
  return Pokedex[pid]["name"];
}

function getBase(pid: PokemonId) {
  return Pokedex[pid]["baseStats"];
}

function getStat(
  stat: BaseStat,
  base: number,
  ev = 252,
  nature = 1.1,
  iv = 31,
  level = 100,
  stage = 0,
  mult = 1
) {
  if (stat === "hp") {
    return (
      Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) +
      level +
      10
    );
  } else {
    if (stage > 0) {
      mult = (mult * (2 + stage)) / 2;
    } else if (stage < 0) {
      mult = (mult * 2) / (2 - stage);
    }
  }

  return Math.floor(
    Math.floor(
      (Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) *
        nature
    ) * mult
  );
}

export function getWeak(pid: PokemonId) {
  let types = Pokedex[pid].types;
  let weak = defensive(types);
  for (let a in Pokedex[pid]["abilities"]) {
    let ability = Pokedex[pid]["abilities"][a];
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

function filterNames(query: string): { name: string; pid: PokemonId }[] {
  let results: { name: string; pid: PokemonId }[][] = [[], []];
  if (query === "") {
    return [];
  }
  for (let mon in Pokedex) {
    if (Pokedex[mon].tier == "CAP") {
      continue;
    }
    let compare = compareString(query, Pokedex[mon].name);
    if (compare.result && compare.pattern) {
      results[compare.pattern].push({ name: Pokedex[mon].name, pid: mon });
    }
  }
  for (let result of results) {
    result.sort((a, b) => {
      if (a > b) return 1;
      if (a < b) return -1;
      return 0;
    });
  }
  return results[0].concat(results[1]);
}

function getPrevo(pid: PokemonId) {
  return toKey(Pokedex[pid]?.prevo);
}

function getBaseForm(pid: PokemonId) {
  return toKey(Pokedex[pid]?.baseSpecies);
}

function getTypes(pid: PokemonId) {
  return Pokedex[pid]["types"];
}

function getAbilities(pid: PokemonId) {
  return Object.values(Pokedex[pid]["abilities"]);
}

function getFormeChange(pid: PokemonId) {
  let forme = toKey(Pokedex[pid]?.changesFrom);
  return forme;
}

function toKey(pid: string | undefined): string {
  if (pid != undefined) {
    return pid.toLowerCase().replace(/[ .-]+/g, "");
  }
  return "";
}

function getLearnset(pid: PokemonId, gen: string) {
  let learnset = LearnsetgetLearnset(pid, gen);
  if (learnset == null) {
    return getLearnset(toKey(Pokedex[pid]?.baseSpecies), gen);
  }
  if ("prevo" in Pokedex[pid]) {
    let subLearnset = getLearnset(toKey(Pokedex[pid].prevo), gen);
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move);
      }
    }
  }
  if ("changesFrom" in Pokedex[pid]) {
    let subLearnset = getLearnset(toKey(Pokedex[pid].changesFrom), gen);
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move);
      }
    }
  }

  if ("battleOnly" in Pokedex[pid]) {
    let battleOnly = Pokedex[pid].battleOnly || "";

    if (typeof battleOnly === "string") {
      let subLearnset = getLearnset(toKey(battleOnly), gen);
      for (let move of subLearnset) {
        if (!(move in learnset)) {
          learnset.push(move);
        }
      }
    } else if (Array.isArray(Pokedex[pid])) {
      for (let item of battleOnly) {
        let subLearnset = getLearnset(toKey(item), gen);
        for (let move of subLearnset) {
          if (!(move in learnset)) {
            learnset.push(move);
          }
        }
      }
    }
  }
  return learnset;
}

function learns(pid: PokemonId, moveId: MoveId, gen: string) {
  if (hasLearnset(pid)) {
    if (inLearnset(pid, moveId, gen)) {
      return true;
    }
    if (
      "prevo" in Pokedex[pid] &&
      learns(toKey(Pokedex[pid].prevo), moveId, gen)
    ) {
      return true;
    }
    if (learns(toKey(Pokedex[pid].changesFrom), moveId, gen)) {
      return true;
    }
  } else if (
    "baseSpecies" in Pokedex[pid] &&
    learns(toKey(Pokedex[pid].baseSpecies), moveId, gen)
  ) {
    return true;
  }
  return false;
}

function getCoverage(pid: PokemonId, gen: string) {
  let learnset = getLearnset(pid, gen);
  let coverage: {
    Physical: {
      [key: string]: {
        ePower: number;
        id: MoveId;
        type: string;
        stab: boolean;
      };
    };
    Special: {
      [key: string]: {
        ePower: number;
        id: MoveId;
        type: string;
        stab: boolean;
      };
    };
  } = { Physical: {}, Special: {} };
  for (let moveId of learnset) {
    let category = getCategory(moveId);
    let type = getType(moveId);
    type = type.charAt(0).toUpperCase() + type.slice(1);
    if (category != "Status") {
      let ePower = getEffectivePower(moveId);
      if (
        !(type in coverage[category]) ||
        coverage[category][type].ePower < ePower
      ) {
        coverage[category][type] = {
          id: moveId,
          ePower: getEffectivePower(moveId),
          type: type,
          stab: getTypes(pid).includes(type),
        };
      }
    }
  }
  return coverage;
}

function needsItem(pid: PokemonId) {
  return "requiredItem" in Pokedex[pid];
}
