import { Document, model, Schema, Types } from "mongoose";
import { PokemonData, pokemonSchema } from "./pokemon.schema";

const matchupTeamReferenceSchema = new Schema<MatchupTeamReference>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const matchupTeamFullSchema = new Schema<MatchupTeamFull>(
  {
    teamName: { type: String, required: true },
    coach: { type: String, required: true },
    team: { type: [pokemonSchema], required: true },
  },
  { _id: false }
);

const matchupTeamSchema = new Schema<MatchupTeam>(
  { type: { type: String, required: true, enum: ["reference", "full"] } },
  { _id: false, discriminatorKey: "type" }
);

matchupTeamSchema.discriminator("reference", matchupTeamReferenceSchema);
matchupTeamSchema.discriminator("full", matchupTeamFullSchema);

const matchTeamSchema = new Schema<TeamStatData>(
  {
    stats: { type: [], required: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const matchSchema = new Schema<MatchData>(
  {
    aTeam: { type: matchTeamSchema, required: true },
    bTeam: { type: matchTeamSchema, required: true },
    replay: { type: String },
    winner: { type: String },
  },
  { _id: false }
);

export const matchupSchema = new Schema<MatchupData>(
  {
    aTeam: { type: matchupTeamSchema, required: true },
    bTeam: { type: matchupTeamSchema, required: true },
    gameTime: { type: String },
    reminder: { type: Number },
    stage: { type: String, required: true },
    matches: { type: [matchSchema], required: true },
  },
  { timestamps: true }
);

export type MatchupTeamBase = { type: "reference" | "full" };

export type MatchupTeamReference = MatchupTeamBase & {
  type: "reference";
  _id: Types.ObjectId;
};

export type MatchupTeamFull = MatchupTeamBase & {
  type: "full";
  teamName: string;
  coach: string;
  team: PokemonData[];
};

export type MatchupTeam = MatchupTeamReference | MatchupTeamFull;

export type MatchStatData = [
  string,
  {
    indirect?: number;
    kills?: number;
    deaths?: number;
    brought?: number;
  }
];

export type TeamStatData = {
  stats: MatchStatData[];
  score: number;
};

export type MatchData = {
  aTeam: TeamStatData;
  bTeam: TeamStatData;
  replay?: string;
  winner?: "a" | "b";
};

export type MatchupData = {
  aTeam: MatchupTeam;
  bTeam: MatchupTeam;
  gameTime?: string;
  reminder?: number;
  stage: string;
  matches: MatchData[];
};

export interface MatchupDocument
  extends Document<Types.ObjectId>,
    MatchupData {}

export const MatchupModel = model<MatchupData>("matchup", matchupSchema);
