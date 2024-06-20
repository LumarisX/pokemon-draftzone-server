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
    paste: {
      type: String,
    },
    _id: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { _id: false }
);

const matchTeamSchema = new mongoose.Schema(
  {
    stats: {
      type: [],
    },
    score: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    aTeam: {
      type: matchTeamSchema,
      required: true,
    },
    bTeam: {
      type: teamSchema,
      required: true,
    },
    stats: {
      type: [],
    },
    score: {
      type: Number,
      default: 0,
    },
    replay: {
      type: String,
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
    matches: {
      type: [matchSchema],
      required: true,
    },
  },
  { timestamps: true }
);

export interface MatchupData {
  aTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  bTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  gameTime?: string;
  reminder?: number;
  stage: string;
  createdAt?: Date;
  updatedAt?: Date;
  matches: {
    aTeam: {
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
    };
    bTeam: {
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
    };
    replay?: string;
  }[];
}

export interface MatchupDocument extends Document<any, any>, MatchupData {}

export const MatchupModel = mongoose.model<MatchupDocument>(
  "matchupstests",
  matchupSchema
);
