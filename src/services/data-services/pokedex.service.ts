import { Pokedex, PokemonId, Stat } from "../../public/data/pokedex";

export function inDex(pid: PokemonId) {
  return pid in Pokedex;
}

export function getName(pid: PokemonId) {
  return Pokedex[pid]["name"];
}

export function getBase(pid: PokemonId) {
  return Pokedex[pid]["baseStats"];
}

export function getStat(
  stat: Stat,
  base: number,
  ev: number = 252,
  nature = 1.1,
  iv: number = 31,
  level: number = 100,
  stage: number = 0,
  mult: number = 1
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
  let weak = TypeService.defensive(types);
  for (let a in Pokedex[pid]["abilities"]) {
    let ability = Pokedex[pid]["abilities"][a];
    switch (ability) {
      case "Fluffy":
        weak.Fire = weak.Fire * 2;
        break;
      case "Dry Skin":
        weak.Fire = weak.Fire * 1.25;
      case "Water Absorb":
      case "Desolate Land":
      case "Storm Drain":
        weak.Water = 0;
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.Electric = 0;
        break;
      case "Flash Fire":
      case "Primordial Sea":
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
      case "Orichalcum Pulse":
      case "Drought":
        weak.Water = weak.Water * 0.5;
        break;
      case "Thick Fat":
        weak.Ice = weak.Ice * 0.5;
      case "Heatproof":
      case "Drizzle":
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
        weak.Ghost = weak.Ghost * 0.5;
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

function filterNames(query: string) {
  let results = [[], []];
  if (query === "") {
    return [];
  }
  for (let pid in Pokedex) {
    if (Pokedex[pid]?.tier == "CAP") {
      continue;
    }
    let compare = FilterService.compare(query, Pokedex[mon].name);
    if (compare.result) {
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
  results = results[0].concat(results[1]);
  return results;
}

function getPrevo(pid: PokemonId) {
  return toKey(Pokedex[pid]?["prevo"]);
}

function getBaseForm(pid: PokemonId) {
  return toKey(Pokedex[pid]?["baseSpecies"]);
}

function getTypes(pid: PokemonId) {
  return Pokedex[pid]["types"];
}

function getAbilities(pid: PokemonId) {
  return Object.values(Pokedex[pid]["abilities"]);
}

function getFormeChange(pid: PokemonId) {
  let forme = toKey(Pokedex[pid]?["changesFrom"]);
  return forme;
}

function toKey(pokemonName: string) {
  return pokemonName.toLowerCase().replace(/[ .-]+/g, "");
  }

function getLearnset(pid: PokemonId, gen: string) {
  let learnset = LearnsetService.getLearnset(pid, gen);
  if (learnset == null) {
    return getLearnset(toKey(Pokedex[pid].baseSpecies), gen);
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
    let subLearnset = getLearnset(toKey(Pokedex[pid].battleOnly), gen);
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move);
      }
    }
  }
  return learnset;
}

function learns(pid: PokemonId, moveId, gen) {
  if (LearnsetService.hasLearnset(pid)) {
    if (LearnsetService.inLearnset(pid, moveId, gen)) {
      return true;
    }
    if (
      "prevo" in Pokedex[pid] &&
      learns(toKey(Pokedex[pid].prevo), moveId, gen)
    ) {
      return true;
    }
    if (
      "changesFrom" in Pokedex[pid] &&
      learns(toKey(Pokedex[pid].changesFrom), moveId, gen)
    ) {
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

function getCoverage(pid: PokemonId, gen) {
  let learnset = getLearnset(pid, gen);
  let coverage = { physical: [], special: [] };
  for (let moveId of learnset) {
    let cat = MoveService.getCategory(moveId);
    let type = MoveService.getType(moveId);
    type = type.charAt(0).toUpperCase() + type.slice(1);
    if (cat != "status") {
      let ePower = MoveService.getEffectivePower(moveId);
      let existing = null;
      for (let i in coverage[cat]) {
        if (coverage[cat][i].type == type) {
          existing = i;
        }
      }
      if (existing == null) {
        coverage[cat].push({
          id: moveId,
          ePower: MoveService.getEffectivePower(moveId),
          type: type,
          stab: getTypes(pid).includes(type),
        });
      } else if (coverage[cat][existing].ePower < ePower) {
        coverage[cat][existing] = {
          id: moveId,
          ePower: MoveService.getEffectivePower(moveId),
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

module.exports = {
  inDex,
  getName,
  needsItem,
  getAbilities,
  filterNames,
  getStat,
  getBase,
  getWeak,
  getLearnset,
  getCoverage,
  getTypes,
  learns,
};
