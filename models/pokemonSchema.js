const mongoose = require('mongoose')

const pokemonSchema = new mongoose.Schema({
  pid: {
    type: String,
    required: true
  },
  shiny: Boolean,
  capt: {
      tera: [String]
  },
  weak: Object
}, { _id: false })

module.exports = pokemonSchema;