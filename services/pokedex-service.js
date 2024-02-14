const Pokedex = require("../public/data/pokedex")["BattlePokedex"]
const TypeService = require('./type-service')
const LearnsetService = require('./matchup-services/learnset-service')
const MoveService = require('./move-service')
const FilterService = require('./filter-service')

function inDex(pokemonId) {
  return pokemonId in Pokedex
}

function getName(pokemonId) {
  return (Pokedex[pokemonId]["name"]);
}

function getBase(pokemonId) {
  return (Pokedex[pokemonId]["baseStats"]);
}

function getStat(stat, base, ev = 252, nature = 1.1, iv = 31, level = 100, stage = 0, mult = 1) {
  if (stat === "hp") {
    return (Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10);
  } else {
    if (stage > 0) {
      mult = mult * (2 + stage) / 2;
    } else if (stage < 0) {
      mult = mult * 2 / (2 - stage);
    }
  }

  return (Math.floor(Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5) * nature) * mult));
}

function getWeak(pokemonId) {
  let types = Pokedex[pokemonId].types
  let weak = TypeService.defensive(types)
  for (let a in Pokedex[pokemonId]["abilities"]) {
    let ability = Pokedex[pokemonId]["abilities"][a]
    switch (ability) {
      case "Fluffy":
        weak.Fire = weak.Fire * 2
        break;
      case "Dry Skin":
        weak.Fire = weak.Fire * 1.25
      case "Water Absorb":
      case "Storm Drain":
        weak.Water = 0
        break;
      case "Volt Absorb":
      case "Lightning Rod":
      case "Motor Drive":
        weak.Electric = 0
        break;
      case "Flash Fire":
      case "Well-Baked Body":
        weak.Fire = 0
        break;
      case "Sap Sipper":
        weak.Grass = 0
        break;
      case "Levitate":
      case "Earth Eater":
        weak.Ground = 0
        break;
      case "Thick Fat":
        weak.Ice = weak.Ice * .5
      case "Heatproof":
        weak.Fire = weak.Fire * .5
        break;
      case "Water Bubble":
        weak.Fire = weak.Fire * .5
      case "Thermal Exchange":
      case "Water Veil":
        weak.brn = 0
        break;
      case "Limber":
        weak.par = 0
        break;
      case "Sweet Veil":
      case "Vital Spirit":
      case "Insomnia":
        weak.slp = 0
        break;
      case "Magma Armor":
        weak.frz = 0
        break
      case "Purifying Salt":
        weak.Ghost = weak.Ghost * .5
      case "Shields Down":
      case "Comatose":
        weak.brn = 0
        weak.par = 0
        weak.frz = 0
        weak.slp = 0
      case "Immunity":
      case "Pastel Veil":
        weak.psn = 0
        weak.tox = 0
        break
      case "Overcoat":
        weak.powder = 0
      case "Magic Guard":
        weak.hail = 0
      case "Sand Force":
      case "Sand Rush":
      case "Sand Veil":
        weak.sandstorm = 0
        break;
      case "Ice Body":
      case "Snow Cloak":
        weak.hail = 0
        break;
    }
  }
  return weak;
}

function filterNames(query){
  let results = [[],[]]
  if(query===''){
    return []
  }
  for(let mon in Pokedex){
    let compare = FilterService.compare(query, Pokedex[mon].name)
    if(compare.result){
      results[compare.pattern].push(Pokedex[mon].name)
    }
  }
  for(let result of results){
    result.sort((a,b) => {
      if(a > b) return 1
      if(a < b) return -1
      return 0
    })
  }
  results = results[0].concat(results[1])
  return results
}

function getPrevo(pokemonId) {
  return toKey(Pokedex[pokemonId]["prevo"]);
}

function getBaseForm(pokemonId) {
  return toKey(Pokedex[pokemonId]["baseSpecies"]);
}

function getTypes(pokemonId) {
  return Pokedex[pokemonId]["types"];
}

function getAbilities(pokemonId) {
  return Object.values(Pokedex[pokemonId]["abilities"]);
}

function getFormeChange(pokemonId) {
  let forme = toKey(Pokedex[pokemonId]["changesFrom"]);
  return forme;
}

function toKey(pokemonId) {
  if (pokemonId != undefined) {
    pokemonId = pokemonId.toLowerCase().replace(/[ .-]+/g, '');
  }
  return pokemonId;
}

function getLearnset(pokemonId, gen) {
  let learnset = LearnsetService.getLearnset(pokemonId, gen)
  if (learnset == null) {
    return getLearnset(toKey(Pokedex[pokemonId].baseSpecies), gen)
  }
  if ("prevo" in Pokedex[pokemonId]) {
    let subLearnset = getLearnset(toKey(Pokedex[pokemonId].prevo), gen)
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move)
      }
    }
  }
  if ("changesFrom" in Pokedex[pokemonId]) {
    let subLearnset = getLearnset(toKey(Pokedex[pokemonId].changesFrom), gen)
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move)
      }
    }
  }
  
  if ("battleOnly" in Pokedex[pokemonId]) {
    let subLearnset = getLearnset(toKey(Pokedex[pokemonId].battleOnly), gen)
    for (let move of subLearnset) {
      if (!(move in learnset)) {
        learnset.push(move)
      }
    }
  }
  return learnset
}

function learns(pokemonId, moveId, gen) {
  if (LearnsetService.hasLearnset(pokemonId)) {
    if (LearnsetService.inLearnset(pokemonId, moveId, gen)) {
      return true
    }
    if ("prevo" in Pokedex[pokemonId] && learns(toKey(Pokedex[pokemonId].prevo), moveId, gen)) {
      return true
    }
    if ("changesFrom" in Pokedex[pokemonId] && learns(toKey(Pokedex[pokemonId].changesFrom), moveId, gen)) {
      return true
    }
  } if ("baseSpecies" in Pokedex[pokemonId] && learns(toKey(Pokedex[pokemonId].baseSpecies), moveId, gen)) {
    return true
  }
  return false
}

function getCoverage(pokemonId, gen) {
  let learnset = getLearnset(pokemonId, gen)
  let coverage = { physical: [], special: []}
  for (let moveId of learnset) {
    let cat = MoveService.getCategory(moveId)
    let type = MoveService.getType(moveId)
    type = type.charAt(0).toUpperCase() + type.slice(1)
    if (cat != "status") {
      let ePower = MoveService.getEffectivePower(moveId)
      let existing = null;
      for(let i in coverage[cat]){
        if(coverage[cat][i].type == type){
          existing = i
        }
      }
      if (existing == null) {
        coverage[cat].push({
          id: moveId,
          ePower: MoveService.getEffectivePower(moveId),
          type: type,
          stab: getTypes(pokemonId).includes(type)
        })
      } else if(coverage[cat][existing].ePower < ePower) {
        coverage[cat][existing] = {
          id: moveId,
          ePower: MoveService.getEffectivePower(moveId),
          type: type,
          stab: getTypes(pokemonId).includes(type)
        }
      }
    }
  }
  return coverage
}

module.exports = { inDex, getName, getAbilities, filterNames, getStat, getBase, getWeak, getLearnset, getCoverage, getTypes, learns }