const pokedex = require("../public/data/pokedex.js")["BattlePokedex"]


function getData(pokemonId) {
  return pokedex[pokemonId]
}

function getName(name) {
  if (name in pokedex) {
    return (pokedex[name]["name"]);
  }
  return ("unknown");
}

function getBase(name) {
  return (pokedex[name]["baseStats"]);
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
/*
function getWeak(name) {
  if (name in pokedex) {
    var weak = null;
    let types = pokedex[name]["types"];
    for (let t in types) {
      if (weak === null) {
        weak = structuredClone(BattleTypeChart[types[t].toLowerCase()]["damageTaken"]);
      } else {
        var ot = structuredClone(BattleTypeChart[types[t].toLowerCase()]["damageTaken"]);
        for (let w in weak) {
          if (w in ot) {
            weak[w] = weak[w] * ot[w];
          }
          delete ot[w];
        }
        for (let w in ot) {
          weak[w] = ot[w];
        }
      }
    }
    for(let a in pokedex[name]["abilities"]){
      let ability = toKey(pokedex[name]["abilities"][a]);
      if(ability in BattleTypeChart){
        var ot = structuredClone(BattleTypeChart[ability]["damageTaken"]);
        for (let w in weak) {
          if (w in ot) {
            weak[w] = weak[w] * ot[w];
          }
          delete ot[w];
        }
        for (let w in ot) {
          weak[w] = ot[w];
        }
      }
    }
    return weak;
  }
}
*/

function getPrevo(name) {
  return toKey(pokedex[name]["prevo"]);
}

function getBaseForm(name) {
  return toKey(pokedex[name]["baseSpecies"]);
}

function getTypes(name) {
  return pokedex[name]["types"];
}

function getAbilities(name) {
  return pokedex[name]["abilities"];
}

function getFormeChange(name) {
  let forme = toKey(pokedex[name]["changesFrom"]);
  return forme;
}

function toKey(name) {
  if (name != undefined) {
    name = name.toLowerCase().replace(/[ .-]+/g, '');
  }
  return name;
}

module.exports ={getData, getName, getAbilities, getStat, getBase}
