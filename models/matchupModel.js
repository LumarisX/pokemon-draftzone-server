const mongoose = require("mongoose");
const pokemonSchema = require("./pokemonSchema");

const statsSchema = new mongoose.Schema(
  {
    indirect: {
      type: Number,
    },
    kills: {
      type: Number,
    },
    deaths: {
      type: Number,
    },
    brought: {
      type: Number,
    },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    team: {
      type: [pokemonSchema],
    },
    name: {
      type: String,
    },
    teamName: {
      type: String,
    },
    stats: {
      type: Map,
      of: statsSchema,
    },
    score: {
      type: Number,
      default: 0,
    },
    _id: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { _id: false }
);

const matchupSchema = new mongoose.Schema(
  {
    aTeam: {
      type: teamSchema,
      required: true,
    },
    bTeam: {
      type: teamSchema,
      required: true,
    },
    stage: {
      type: String,
      required: true,
    },
    replay: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("matchups", matchupSchema);
