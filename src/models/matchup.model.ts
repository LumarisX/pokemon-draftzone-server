import mongoose, { Document } from "mongoose";
import { DraftSpecies } from "../classes/pokemon";
import { pokemonSchema } from "./pokemon.schema";

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
      type: matchTeamSchema,
      required: true,
    },
    replay: {
      type: String,
    },
    winner: {
      type: String,
    },
  },
  { _id: false }
);

export const matchupSchema = new mongoose.Schema(
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

export type StatData = [
  string,
  {
    indirect?: number;
    kills?: number;
    deaths?: number;
    brought?: number;
  }
];

export type MatchData = {
  aTeam: {
    stats: StatData[];
    score: number;
  };
  bTeam: {
    stats: StatData[];
    score: number;
  };
  replay?: string;
  winner?: "a" | "b";
};

export interface MatchupData {
  aTeam: {
    team: DraftSpecies[];
    owner: string;
    name?: string;
    teamName?: string;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  bTeam: {
    team: DraftSpecies[];
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
  matches: MatchData[];
}

export interface MatchupDocument extends Document<any, any>, MatchupData {}

export const MatchupModel = mongoose.model<MatchupDocument>(
  "matchups",
  matchupSchema
);
