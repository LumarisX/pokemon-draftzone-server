const mongoose = require('mongoose')
const pokemonSchema = require('./pokemonSchema')

const statsSchema = new mongoose.Schema({
  pid: {
    type: String,
    required: true
  },
  kills:{
    type: Number,
    required: true,
    default: 0
  },
  deaths:{
    type: Number,
    required: true,
    default: 0
  },
  brought:{
    type: Number,
    required: true,
    default: 0
  }
}, { _id: false })

const teamSchema = new mongoose.Schema({
  team: {
    type: [pokemonSchema]
  },
  name: {
    type: String
  },
  teamName: {
    type: String
  },
  stats: {
    type: [statsSchema]
  },
  _id: {
    type: mongoose.Schema.Types.ObjectId
  }
}, { _id: false })

const matchupSchema = new mongoose.Schema({
  aTeam: {
    type: teamSchema,
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