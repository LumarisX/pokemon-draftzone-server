const mongoose = require('mongoose')
const pokemonSchema = require('./pokemonSchema')
const opponentSchema = require('./opponentSchema')

const draftSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true
  },
  leagueId: {
    type: String,
    required: true
  },
  owner: {
    type: String,
    required: true,
    ref: "users"
  },
  format: {
    type: String,
    required: true
  },
  ruleset: {
    type: String,
    required: true
  },
  team: {
    type: [pokemonSchema],
    required: true
  },
  opponents: {
    type: [opponentSchema]
  }
}, {timestamps: true})

draftSchema.index({ owner: 1, leagueId: 1}, {unique:true })

module.exports = mongoose.model('drafts', draftSchema);