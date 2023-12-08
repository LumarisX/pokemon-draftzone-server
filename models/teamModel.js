const mongoose = require('mongoose')

const teamSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true
  },
  format: {
    type: String,
    required: true
  },
  ruleset: {
    type: String,
    required: true
  }
})

module.exports = mongoose.model('leagues', teamSchema);