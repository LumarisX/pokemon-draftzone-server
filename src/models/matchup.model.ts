import mongoose from "mongoose";
import { pokemonSchema } from "./pokemon.schema";

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
      type: [statsSchema],
    },
    score: {
      type: Number,
      default: 0,
    },
    paste: {
      type: String,
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

export const MatchupModel = mongoose.model("matchups", matchupSchema);
