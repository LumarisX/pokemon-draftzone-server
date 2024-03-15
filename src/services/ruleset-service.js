const Rulesets = require("../public/data/rulesets")["Rulesets"]
const Formats = require("../public/data/rulesets")["Formats"]

function getRuleset(rulesetId) {
  return Rulesets[rulesetId]
}

function getFormat(formatId) {
  return Formats[formatId]
}

function getRulesets(){
  return Object.keys(Rulesets)
}

function getFormats(){
  return Object.keys(Formats)
}

module.exports = { getRuleset, getFormat, getRulesets, getFormats }