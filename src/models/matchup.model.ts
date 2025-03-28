import { Document, model, Schema, Types } from "mongoose";
import { PokemonData, pokemonSchema } from "./pokemon.schema";

const matchupTeamReferenceSchema = new Schema<MatchupTeamReference>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    paste: { type: String },
  },
  { _id: false }
);

const matchupTeamFullSchema = new Schema<MatchupTeamFull>(
  {
    teamName: { type: String, required: true },
    coach: { type: String },
    team: { type: [pokemonSchema], required: true },
    paste: { type: String },
  },
  { _id: false }
);

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
    aTeam: { type: matchupTeamReferenceSchema, required: true },
    bTeam: { type: matchupTeamFullSchema, required: true },
    gameTime: { type: String },
    reminder: { type: Number },
    stage: { type: String, required: true },
    notes: { type: String, default: undefined },
    matches: { type: [matchSchema], required: true },
  },
  { timestamps: true }
);

export type MatchupTeamBase = {
  paste?: string;
};

export type MatchupTeamReference = MatchupTeamBase & {
  _id: Types.ObjectId;
};

export type MatchupTeamFull = MatchupTeamBase & {
  teamName: string;
  coach?: string;
  team: PokemonData[];
};

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
  aTeam: MatchupTeamReference;
  bTeam: MatchupTeamFull;
  gameTime?: string;
  reminder?: number;
  stage: string;
  notes?: string;
  matches: MatchData[];
};

export type MatchupDocument = Document<Types.ObjectId> & MatchupData;

export const MatchupModel = model<MatchupData>("matchup", matchupSchema);
