import mongoose from "mongoose";
import { pokemonSchema } from "./pokemon.schema";

const draftSchema = new mongoose.Schema(
  {
    leagueName: {
      type: String,
      required: true,
    },
    leagueId: {
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
      type: [pokemonSchema],
      required: true,
    },
  },
  { timestamps: true }
);

draftSchema.index({ owner: 1, leagueId: 1 }, { unique: true });

export const DraftModel = mongoose.model("drafts", draftSchema);