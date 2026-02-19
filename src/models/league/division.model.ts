import mongoose, { Schema, Types, Document } from "mongoose";
import { LeagueTeamDocument } from "./team.model";
import {
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
  LEAGUE_TOURNAMENT_COLLECTION,
} from ".";
import { LeagueTournamentDocument } from "./tournament.model";

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
  skipTime?: Date;
  channelId?: string;
  timerLength: number;
  skipTimerPenalty: number;
  remainingTime?: number;
  draftStyle: "snake" | "linear";
  draftCounter: number;
  status: "PRE_DRAFT" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  public: boolean;
  eventLog: DraftEventLog[];
  tournament: Types.ObjectId | LeagueTournamentDocument;
  useRandomDraftOrder?: boolean;
  trades: DraftTrade[];
};

export type DraftTrade = {
  trades: {}[];
};

const TradeSchema: Schema<DraftTrade> = new Schema({
  trades: [],
});

export type LeagueDivisionDocument = Document &
  LeagueDivision & { _id: Types.ObjectId };

const LeagueDivisionSchema: Schema<LeagueDivisionDocument> = new Schema(
  {
    divisionKey: { type: String, required: true },
    name: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
    skipTime: { type: Date },
    channelId: { type: String },
    timerLength: { type: Number },
    skipTimerPenalty: { type: Number, default: 30 },
    remainingTime: { type: Number },
    draftStyle: { type: String, enum: ["snake", "linear"], default: "snake" },
    public: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["PRE_DRAFT", "IN_PROGRESS", "PAUSED", "COMPLETED"],
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
    tournament: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TOURNAMENT_COLLECTION,
      required: true,
    },
    useRandomDraftOrder: { type: Boolean, default: true },
    trades: { type: [TradeSchema], default: [] },
  },
  { timestamps: true },
);

LeagueDivisionSchema.index({ tournament: 1, divisionKey: 1 }, { unique: true });

export default mongoose.model<LeagueDivisionDocument>(
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionSchema,
);
