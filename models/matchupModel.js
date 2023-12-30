const mongoose = require('mongoose')
const pokemonSchema = require('./pokemonSchema')

const teamSchema = new mongoose.Schema({
  team: {
    type: [pokemonSchema],
    required: true
  },
  name: {
    type: String,
    required: true
  }
}, { _id: false })

const matchupSchema = new mongoose.Schema({
    aTeam: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    bTeam: {
      type: teamSchema,
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
    }
}, { timestamps: true })

module.exports = mongoose.model('matchups', matchupSchema);