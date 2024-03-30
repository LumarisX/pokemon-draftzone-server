import mongoose, { Document } from "mongoose";
import { PokemonData, pokemonSchema } from "./pokemon.schema";
import { ID } from "@pkmn/data";

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

interface Stats {
  indirect?: number;
  kills?: number;
  deaths?: number;
  brought?: number;
}

export interface MatchupData {
  aTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    stats: Map<string, Stats>;
    score: number;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  bTeam: {
    team: PokemonData[];
    name?: string;
    teamName?: string;
    stats: Map<string, Stats>;
    score: number;
    paste?: string;
    _id?: mongoose.Schema.Types.ObjectId;
  };
  stage: string;
  replay?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MatchupDocumentTest extends Document<any, any>, MatchupData {}

export const MatchupModelTest = mongoose.model<MatchupDocumentTest>(
  "matchupstest",
  matchupSchema
);
