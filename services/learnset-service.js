const Learnsets = require("../public/data/learnsets")["BattleLearnsets"]

function getLearnset(pokemonId, gen = "nd") {
  let ls = [];
  if (pokemonId in Learnsets && "learnset" in Learnsets[pokemonId]) {
    ls = Learnsets[pokemonId]["learnset"];
  } else {
    return null;
  }
  for (let m in ls) {
    if (!genCheck(ls[m], gen)) {
      delete ls[m];
    }
  }
  return (Object.keys(ls));
}

function inLearnset(pokemonId, moveId, gen="nd"){
  return (hasLearnset(pokemonId) && moveId in Learnsets[pokemonId]["learnset"] && genCheck(Learnsets[pokemonId]["learnset"][moveId],gen))
}

function hasLearnset(pokemonId){
  return pokemonId in Learnsets
}
/*

function getLearnlist(move, gen = "nd", list = Learnsets) {
  let ll = [];
  for (let m in Learnsets) {
    if ("learnset" in Learnsets[m] && move in Learnsets[m]["learnset"] && genCheck(Learnsets[m]["learnset"][move], gen)) {
      ll.push(m);
    }
  }
  return (ll);
}

function getCoverage(name, gen = "nd") {
  let ls = getLearnset(name, gen);
  let coverage = { "Physical": {}, "Special": {} };
  for (let m in ls) {
    let md = moves.getMove(ls[m]);
    if (md["category"] != "Status") {
      let value = moves.getValue(ls[m]);
      if (!(md["type"] in coverage[md["category"]]) || coverage[md["category"]][md["type"]]["value"] < value) {
        coverage[md["category"]][md["type"]] = { "name": md["name"], "value": value };
      }
    }
  }
  return (coverage);
}

function learn(name, moveName, gen = "nd") {
  let ls = getLearnset(name, gen);
  return ls.includes(moveName);
}
*/

function genCheck(move, gen) {
  if (gen === "nd") {
    return true;
  }
  for (let lk in move) {
    let genReg = new RegExp("^" + gen + "\\D");
    if (genReg.test(move[lk])) {
      return true;
    }
  }
  return false;
}

module.exports = { getLearnset, inLearnset, hasLearnset }