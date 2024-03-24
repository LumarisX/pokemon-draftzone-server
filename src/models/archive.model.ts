import { ID } from "@pkmn/data";
import mongoose, { Document } from "mongoose";

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

export interface ArchiveData {
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
  team: ID[];
}

export interface ArchiveDocument extends ArchiveData, Document<any, any> {}

export const ArchiveModel = mongoose.model<ArchiveDocument>(
  "archives",
  archiveSchema
);
