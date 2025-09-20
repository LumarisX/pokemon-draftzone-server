import mongoose, { Schema, Types, Document } from "mongoose";
import { LEAGUE_TEAM_COLLECTION, LeagueTeamDocument } from "./team.model";

export const LEAGUE_DIVISION_COLLECTION = "LeagueDivision";

export type DraftRule = {
  header: string;
  details: string;
};

export type DraftEventLog = {
  eventType: "PICK" | "SKIP" | "TIMER_START" | "TIMER_PAUSE";
  details?: string;
  timestamp: Date;
};

export type LeagueDivision = {
  divisionKey: string;
  name: string;
  teams: (Types.ObjectId | LeagueTeamDocument)[];
  skipTime: Date;
  timerLength: number;
  draftStyle: "snake" | "linear";
  draftCounter: number;
  status: "PRE_DRAFT" | "IN_PROGRESS" | "COMPLETED";
  eventLog: DraftEventLog[];
};

export type LeagueDivisionDocument = Document &
  LeagueDivision & { _id: Types.ObjectId };

const LeagueDivisionSchema: Schema<LeagueDivisionDocument> = new Schema(
  {
    divisionKey: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
    skipTime: { type: Date },
    timerLength: { type: Number, default: 90 },
    draftStyle: { type: String, enum: ["snake", "linear"], default: "snake" },
    status: {
      type: String,
      enum: ["PRE_DRAFT", "IN_PROGRESS", "COMPLETED"],
      default: "PRE_DRAFT",
    },
    draftCounter: { type: Number, default: 0 },
    eventLog: [
      {
        eventType: {
          type: String,
          enum: ["PICK", "SKIP", "TIMER_START", "TIMER_PAUSE"],
        },
        details: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<LeagueDivisionDocument>(
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionSchema
);
