import mongoose, { Document } from "mongoose";
import { PokemonData, pokemonSchema } from "./pokemon.schema";

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
      type: [],
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
    gameTime: {
      type: String,
    },
    reminder: {
      type: Number,
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

export interface MatchupData {
  aTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    stats: [
      string,
      {
        indirect?: number;
        kills?: number;
        deaths?: number;
        brought?: number;
      }
    ][];
    score: number;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  bTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    stats: [
      string,
      {
        indirect?: number;
        kills?: number;
        deaths?: number;
        brought?: number;
      }
    ][];
    score: number;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  gameTime?: string;
  reminder?: number;
  stage: string;
  replay?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MatchupDocument extends Document<any, any>, MatchupData {}

export const MatchupModel = mongoose.model<MatchupDocument>(
  "matchups",
  matchupSchema
);
