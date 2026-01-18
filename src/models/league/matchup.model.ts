import { Document, model, Schema, Types } from "mongoose";
import { LEAGUE_TEAM_COLLECTION } from "./team.model";
import { LEAGUE_STAGE_COLLECTION } from "./stage.model";

export const LEAGUE_MATCHUP_COLLECTION = "LeagueMatchup";

export type MatchResult = {
  replay: string;
  winner: "team1" | "team2";
  team1: {
    score: number;
    pokemon: {
      id: string;
      name: string;
      stats?: {
        kills?: number;
        indirect?: number;
        deaths?: number;
        brought?: number;
      };
    }[];
  };
  team2: {
    score: number;
    pokemon: {
      id: string;
      name: string;
      stats?: {
        kills?: number;
        indirect?: number;
        deaths?: number;
        brought?: number;
      };
    }[];
  };
};

export type LeagueMatchupData = {
  stageId: Types.ObjectId;
  team1Id: Types.ObjectId;
  team2Id: Types.ObjectId;
  results: MatchResult[];
  notes?: string;
  scheduledDate?: Date;
  scoreOverride?: {
    team1score: number;
    team2score: number;
    winner: "team1" | "team2";
  };
};

export type LeagueMatchupDocument = Document<Types.ObjectId> &
  LeagueMatchupData;

export const leagueMatchupSchema = new Schema<LeagueMatchupData>(
  {
    stageId: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_STAGE_COLLECTION,
      required: true,
      index: true,
    },
    team1Id: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    team2Id: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    results: [
      {
        replay: { type: String, required: true },
        winner: { type: String, enum: ["team1", "team2"], required: true },
        team1: {
          score: { type: Number },
          pokemon: [
            {
              id: { type: String, required: true },
              name: { type: String, required: true },
              stats: {
                kills: { type: Number },
                indirect: { type: Number },
                deaths: { type: Number },
                brought: { type: Number },
              },
            },
          ],
        },
        team2: {
          score: { type: Number },
          pokemon: [
            {
              id: { type: String, required: true },
              name: { type: String, required: true },
              stats: {
                kills: { type: Number },
                indirect: { type: Number },
                deaths: { type: Number },
                brought: { type: Number },
              },
            },
          ],
        },
      },
    ],
    notes: { type: String },
    scheduledDate: { type: Date },
    scoreOverride: {
      type: {
        team1score: { type: Number, required: true },
        team2score: { type: Number, required: true },
        winner: { type: String, enum: ["team1", "team2"], required: true },
      },
    },
  },
  { timestamps: true }
);

export const LeagueMatchupModel = model<LeagueMatchupData>(
  LEAGUE_MATCHUP_COLLECTION,
  leagueMatchupSchema
);
