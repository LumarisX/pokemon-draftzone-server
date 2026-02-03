import { ID } from "@pkmn/data";
import { Document, model, Model, Schema } from "mongoose";
import { DraftData } from "./draft.model";
import { MatchupData, MatchupTeamFull } from "./matchup.model";

export const ARCHIVE_COLLECTION = "archives";

export type StatData = {
  indirect?: number;
  kills?: number;
  deaths?: number;
  brought?: number;
};

export type PokemonRef = {
  id: ID;
};

export type ArchiveBaseData = {
  leagueName: string;
  teamName?: string;
  owner: string;
  format: string;
  ruleset: string;
  team: PokemonRef[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type ArchiveType = "ArchiveV1" | "ArchiveV2";

export type ArchiveBaseDocument = Document &
  ArchiveBaseData & {
    archiveType?: ArchiveType;
  };

// V1 Types
export type MatchV1Data = {
  winner?: "a" | "b";
  teamName?: string;
  stage: string;
  stats: [string, StatData][];
  score: [number, number];
  replay?: string;
};

export type ArchiveV1Data = ArchiveBaseData & {
  archiveType?: "ArchiveV1";
  matches: MatchV1Data[];
};

export type ArchiveV1Document = Document & ArchiveV1Data;

// V2 Types
export type MatchTeamStatsV2 = {
  stats: [string, StatData][];
  score: number;
};

export type MatchV2Data = {
  aTeam: MatchTeamStatsV2;
  bTeam: MatchTeamStatsV2;
  replay?: string;
  winner?: "a" | "b";
};

export type MatchupStatsTeam = {
  wins: number;
  stats: Map<string, StatData>;
  differential: number;
};

export type MatchupStats = {
  winner?: "a" | "b";
  aTeam: MatchupStatsTeam;
  bTeam: MatchupStatsTeam;
};

export type MatchupV2Data = Omit<
  MatchupData,
  "aTeam" | "bTeam" | "gameTime" | "reminder" | "notes"
> &
  MatchupTeamFull & {
    pastes: { aTeam?: string; bTeam?: string };
    matches: MatchV2Data[];
    stats: MatchupStats;
  };

export type ScoreData = {
  wins: number;
  loses: number;
  diff: number;
};

export type ArchiveV2Data = ArchiveBaseData &
  DraftData & {
    archiveType: "ArchiveV2";
    matchups: MatchupV2Data[];
    stats: Map<string, StatData>;
    score: ScoreData;
  };

export type ArchiveV2Document = Document & ArchiveV2Data;

const pokemonSchema = new Schema<PokemonRef>(
  {
    id: { type: String, required: true },
  },
  { _id: false },
);

const statsSchema = new Schema<StatData>(
  {
    indirect: { type: Number },
    kills: { type: Number },
    deaths: { type: Number },
    brought: { type: Number },
  },
  { _id: false },
);

const matchSchemaV1 = new Schema<MatchV1Data>(
  {
    teamName: { type: String },
    stage: { type: String, required: true },
    score: {
      type: [Number, Number],
      required: true,
      default: [0, 0],
    },
    winner: { type: String, enum: ["a", "b"] },
    replay: { type: String },
    stats: [[String, statsSchema]],
  },
  { _id: false },
);

const matchTeamSchemaV2 = new Schema<MatchTeamStatsV2>(
  {
    stats: {
      type: [[String, statsSchema]],
      required: true,
    },
    score: { type: Number, default: 0 },
  },
  { _id: false },
);

const matchSchemaV2 = new Schema<MatchV2Data>(
  {
    aTeam: { type: matchTeamSchemaV2, required: true },
    bTeam: { type: matchTeamSchemaV2, required: true },
    replay: { type: String },
    winner: { type: String, enum: ["a", "b"] },
  },
  { _id: false },
);

const matchupStatsTeamSchema = new Schema<MatchupStatsTeam>(
  {
    wins: { type: Number, required: true, default: 0 },
    stats: { type: Map, of: statsSchema, default: {} },
    differential: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const matchupStatsSchema = new Schema<MatchupStats>(
  {
    winner: { type: String, enum: ["a", "b"] },
    aTeam: { type: matchupStatsTeamSchema, required: true },
    bTeam: { type: matchupStatsTeamSchema, required: true },
  },
  { _id: false },
);

const matchupSchemaV2 = new Schema<MatchupV2Data>(
  {
    teamName: { type: String },
    coach: { type: String },
    team: [pokemonSchema],
    paste: { type: String },
    pastes: {
      type: {
        aTeam: { type: String },
        bTeam: { type: String },
      },
      default: {},
    },
    stage: { type: String, required: true },
    matches: [matchSchemaV2],
    stats: { type: matchupStatsSchema, default: {} },
  },
  { _id: false },
);

const scoreSchema = new Schema<ScoreData>(
  {
    wins: { type: Number, required: true, default: 0 },
    loses: { type: Number, required: true, default: 0 },
    diff: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

// Base Schema
const baseSchema = new Schema(
  {
    leagueName: { type: String, required: true },
    teamName: { type: String },
    owner: { type: String, required: true, ref: "users" },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
    team: [pokemonSchema],
  },
  {
    timestamps: true,
    discriminatorKey: "archiveType",
    strict: false,
  },
);

export const ArchiveBaseModel = model<ArchiveBaseDocument>(
  "ArchiveBase",
  baseSchema,
  ARCHIVE_COLLECTION,
);

export const ArchiveV1Model = ArchiveBaseModel.discriminator<ArchiveV1Document>(
  "ArchiveV1",
  new Schema({
    matches: [matchSchemaV1],
  }),
);

export const ArchiveV2Model = ArchiveBaseModel.discriminator<ArchiveV2Document>(
  "ArchiveV2",
  new Schema({
    tournamentId: { type: String, required: true },
    doc: { type: String },
    stats: { type: Map, of: statsSchema, default: {} },
    score: { type: scoreSchema, required: true },
    matchups: [matchupSchemaV2],
  }),
);
