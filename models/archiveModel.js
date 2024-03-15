const mongoose = require("mongoose");

const statsSchema = new mongoose.Schema(
  {
    indirect: {
      type: Number,
      default: 0,
    },
    kills: {
      type: Number,
      default: 0,
    },
    deaths: {
      type: Number,
      default: 0,
    },
    brought: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const sideSchema = new mongoose.Schema(
  {
    score: {
      type: Number,
      default: 0,
    },
    stats: {
      type: [statsSchema],
    },
    paste: {
      type: String,
    },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    stage: {
      type: String,
    },
    replay: {
      type: String,
    },
    teamName: {
      type: String,
    },
    aTeam: {
      type: sideSchema,
    },
    bTeam: {
      type: sideSchema,
    },
  },
  { _id: false }
);

const archiveSchema = new mongoose.Schema(
  {
    leagueName: {
      type: String,
      required: true,
    },
    teamName: {
      type: String,
    },
    owner: {
      type: String,
      required: true,
      ref: "users",
    },
    format: {
      type: String,
      required: true,
    },
    ruleset: {
      type: String,
      required: true,
    },
    team: {
      type: [String],
      required: true,
    },
    matches: {
      type: [matchSchema],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("archives", archiveSchema);
