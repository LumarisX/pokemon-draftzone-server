const Gens = require("../public/data/rulesets")["Generation"]
const Formats = require("../public/data/rulesets")["Format"]

function getGen(genId) {
  return Gens[genId]
}

function getFormat(formatId) {
  return Formats[formatId]
}

module.exports = { getGen, getFormat }