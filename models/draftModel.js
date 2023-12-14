const mongoose = require('mongoose')

const draftSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true
  },
  format: {
    type: Number,
    required: true
  },
  ruleset: {
    type: Number,
    required: true
  }
})

module.exports = mongoose.model('leagues', draftSchema);