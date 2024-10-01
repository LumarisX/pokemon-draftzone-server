import mongoose from "mongoose";
import { getRulesets } from "../data/rulesets";
import { getFormats } from "../data/formats";

const leagueAdSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true,
    trim: true,
  },
  owner: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  recruitmentStatus: {
    type: String,
    enum: ["Open", "Closed", "Full", "Canceled"],
    default: "Open",
    required: true,
  },
  hostLink: {
    type: String,
    trim: true,
  },
  divisions: {
    type: [
      {
        divisionName: {
          type: String,
          required: true,
          trim: true,
        },
        skillLevelRange: {
          from: { type: Number, min: 0, max: 3, required: true },
          to: { type: Number, min: 0, max: 3 },
        },
        prizeValue: {
          type: Number,
          min: 0,
          max: 3,
        },
        platform: {
          type: String,
          enum: ["Pokémon Showdown", "Scarlet/Violet"],
          required: true,
        },
        format: {
          type: String,
          enum: [...getFormats(), "Other"],
          required: true,
        },
        ruleset: {
          type: String,
          enum: [...getRulesets(), "Other"],
          required: true,
        },
        description: {
          type: String,
          trim: true,
        },
      },
      { _id: false },
    ],
  },
  signupLink: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ["Accepted", "Denied", "Pending"],
    default: "Pending",
    required: true,
  },
  closesAt: {
    type: Date,
    required: true,
  },
  seasonStart: {
    type: Date,
  },
  seasonEnd: {
    type: Date,
  },
  tags: {
    type: [String],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const LeagueAdModel = mongoose.model("leaguead", leagueAdSchema);
