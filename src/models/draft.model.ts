import { Document, model, Schema } from "mongoose";
import { PokemonData, pokemonSchema } from "./pokemon.schema";

const draftSchema = new Schema(
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

export interface DraftData {
  leagueName: string;
  leagueId: string;
  teamName: string;
  score?: {
    wins: number;
    loses: number;
    diff: string;
  };
  owner: string;
  format: string;
  ruleset: string;
  team: PokemonData[];
}

export interface DraftDocument extends DraftData, Document<any, any> {}

draftSchema.index({ owner: 1, leagueId: 1 }, { unique: true });

export const DraftModel = model<DraftDocument>("draft", draftSchema);
