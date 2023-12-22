const Typechart = require("../public/data/typechart")["BattleTypeChart"]

const base = { Bug: 1, Dark: 1, Dragon: 1, Electric: 1, Fairy: 1, Fighting: 1, Fire: 1, Flying: 1, Ghost: 1, Grass: 1, Ground: 1, Ice: 1, Normal: 1, Poison: 1, Psychic: 1, Rock: 1, Steel: 1, Water: 1, brn: 1, par: 1, prankster: 1, tox: 1, psn: 1, frz: 1, slp: 1, powder: 1, sandstorm: 1, hail: 1, trapped: 1 }

function defensive(types) {
  let out = structuredClone(base)
  for (let t of types) {
    let def = convert(Typechart[t.toLowerCase()].damageTaken)
    for (let type in def) {
      out[type] = out[type] * def[type]
    }
  }
  return out
}

function convert(typeData) {
  const c = [1, 2, .5, 0]
  let converted = {}
  for (let t in typeData) {
    converted[t] = c[typeData[t]]
  }
  return converted
}

module.exports = { defensive, base}