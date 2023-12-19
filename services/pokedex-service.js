const Pokedex = require("../public/data/pokedex.js")["BattlePokedex"]
const TypeService = require('./type-service')
const LearnsetService = require('./learnset-service')

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
  return Pokedex[pokemonId]["abilities"];
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

function getLearnset(pokemonId) {
  
}

module.exports = { getName, getAbilities, getStat, getBase, getWeak, getLearnset}