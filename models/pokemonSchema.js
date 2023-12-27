const mongoose = require('mongoose')

const pokemonSchema = new mongoose.Schema({
  pid: {
    type: String,
    required: true
  },
  shiny: {
    type: Boolean
  },
  captain: {
    type: [{}],
    default: undefined
    
  }
}, {_id: false})

module.exports = pokemonSchema;