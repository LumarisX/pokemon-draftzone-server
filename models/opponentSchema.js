const mongoose = require('mongoose')
const pokemonSchema = require('./pokemonSchema')

//REMOVE EVENTUALLY
const opponentSchema = new mongoose.Schema({
  opponentName: {
    type: String,
    required: true
  },
  score: {
    type: [Number],
    required: true,
    default: [0, 0]
  },
  stage: {
    type: String,
    required: true
  },
  team: {
    type: [pokemonSchema],
    required: true
  }
}, { timestamps: true })

module.exports = opponentSchema