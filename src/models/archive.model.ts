import { ID } from "@pkmn/data";
import mongoose, { Document } from "mongoose";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";

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

const pokemonSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
    },
    stage: {
      type: String,
      required: true,
    },
    score: {
      type: [],
      required: true,
      default: [0, 0],
    },
    winner: {
      type: String,
    },
    replay: {
      type: String,
    },
    stats: {
      type: [],
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
      type: [pokemonSchema],
      required: true,
    },
    matches: {
      type: [matchSchema],
      required: true,
    },
  },
  { timestamps: true }
);

export interface ArchiveData {
  leagueName: string;
  teamName: string;
  owner: string;
  format: FormatId;
  ruleset: RulesetId;
  team: { id: ID }[];
  matches: {
    winner: "a" | "b" | undefined;
    teamName?: string;
    stage: string;
    stats: [
      string,
      {
        indirect?: number;
        kills?: number;
        deaths?: number;
        brought?: number;
      }
    ][];
    score: [number, number];
    replays?: (string | undefined)[];
  }[];
}

export interface ArchiveDocument extends ArchiveData, Document {
  updatedAt: Date;
  createdAt: Date;
}

export const ArchiveModel = mongoose.model<ArchiveDocument>(
  "archives",
  archiveSchema
);
