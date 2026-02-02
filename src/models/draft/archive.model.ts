import { ID } from "@pkmn/data";
import { Document, model, Model, Schema } from "mongoose";
import { DraftData } from "./draft.model";
import { MatchupData, MatchupTeamFull } from "./matchup.model";

const pokemonSchema = new Schema(
  {
    id: { type: String, required: true },
  },
  { _id: false },
);

const matchSchemaV1 = new Schema(
  {
    teamName: { type: String },
    stage: { type: String, required: true },
    score: { type: [], required: true, default: [0, 0] },
    winner: { type: String },
    replay: { type: String },
    stats: { type: [] },
  },
  { _id: false },
);

const statsSchema = new Schema(
  {
    indirect: { type: Number },
    kills: { type: Number },
    deaths: { type: Number },
    brought: { type: Number },
  },
  { _id: false },
);

const matchTeamSchema = new Schema(
  {
    stats: { type: [], required: true },
    score: { type: Number, default: 0 },
  },
  { _id: false },
);

const matchSchemaV2 = new Schema(
  {
    aTeam: { type: matchTeamSchema, required: true },
    bTeam: { type: matchTeamSchema, required: true },
    replay: { type: String },
    winner: { type: String, enum: ["a", "b"] },
  },
  { _id: false },
);

const matchupSchema = new Schema(
  {
    teamName: { type: String },
    coach: { type: String },
    team: { type: [pokemonSchema], required: true },
    paste: { type: String },

    pastes: {
      type: {
        aTeam: { type: String },
        bTeam: { type: String },
      },
      default: {},
    },

    stage: { type: String, required: true },

    matches: { type: [matchSchemaV2], required: true },

    stats: {
      type: {
        winner: { type: String, enum: ["a", "b"] },
        aTeam: {
          type: {
            wins: { type: Number, required: true, default: 0 },
            stats: { type: Map, of: statsSchema, default: {} },
            differential: { type: Number, required: true, default: 0 },
          },
          required: true,
        },
        bTeam: {
          type: {
            wins: { type: Number, required: true, default: 0 },
            stats: { type: Map, of: statsSchema, default: {} },
            differential: { type: Number, required: true, default: 0 },
          },
          required: true,
        },
      },
      default: {},
    },
  },
  { _id: false },
);

const baseSchema = new Schema(
  {
    leagueName: { type: String, required: true },
    teamName: { type: String },
    owner: { type: String, required: true, ref: "users" },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
    team: { type: [pokemonSchema], required: true },
  },
  {
    timestamps: true,
    discriminatorKey: "archiveType",
    strict: false,
  },
);

export const ArchiveBaseModel: Model<ArchiveBaseDocument> =
  model<ArchiveBaseDocument>("ArchiveBase", baseSchema, "archives");

const v1Extra = new Schema(
  {
    matches: { type: [matchSchemaV1], required: true },
  },
  { _id: false },
);

export const ArchiveV1Model = ArchiveBaseModel.discriminator<ArchiveV1Document>(
  "ArchiveV1",
  new Schema(v1Extra.obj),
);

const v2Extra = new Schema(
  {
    tournamentId: { type: String, required: true },
    doc: { type: String, default: undefined },
    stats: { type: Map, of: statsSchema, default: {} },
    score: {
      wins: { type: Number, required: true, default: 0 },
      loses: { type: Number, required: true, default: 0 },
      diff: { type: Number, required: true, default: 0 },
    },
    matchups: { type: [matchupSchema], required: true },
  },
  { _id: false },
);

export const ArchiveV2Model = ArchiveBaseModel.discriminator<ArchiveV2Document>(
  "ArchiveV2",
  new Schema(v2Extra.obj),
);

export type StatData = {
  indirect?: number;
  kills?: number;
  deaths?: number;
  brought?: number;
};

type ArchiveBaseData = {
  leagueName: string;
  teamName?: string;
  owner: string;
  format: string;
  ruleset: string;
  team: { id: ID }[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type ArchiveType = "ArchiveV1" | "ArchiveV2";

export type ArchiveBaseDocument = Document &
  ArchiveBaseData & {
    archiveType?: ArchiveType;
  };

export type ArchiveV1Data = ArchiveBaseData & {
  archiveType?: "ArchiveV1";
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
      },
    ][];
    score: [number, number];
    replays?: (string | undefined)[];
  }[];
};

export type ArchiveV1Document = Document & ArchiveV1Data;

export type ArchiveV2Data = ArchiveBaseData &
  DraftData & {
    matchups: (Omit<
      MatchupData,
      "aTeam" | "bTeam" | "gameTime" | "reminder" | "notes"
    > &
      MatchupTeamFull & {
        pastes: { aTeam?: string; bTeam?: string };
        stats: {
          winner: "a" | "b" | undefined;
          aTeam: {
            wins: number;
            stats: Map<string, StatData>;
            differential: number;
          };
          bTeam: {
            wins: number;
            stats: Map<string, StatData>;
            differential: number;
          };
        };
      })[];
    stats: Map<string, StatData>;
    archiveType: "ArchiveV2";
  };

export type ArchiveV2Document = Document & ArchiveV2Data;
