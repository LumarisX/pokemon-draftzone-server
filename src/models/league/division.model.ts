import mongoose, { Schema, Types } from "mongoose";
import { DRAFT_TEAM_COLLECTION, DraftTeamDocument } from "./team.model";
import {
  DRAFT_TIER_LIST_COLLECTION,
  DraftTierGroup,
  DraftTierGroupSchema,
  DraftTierListDocument,
} from "./tier-list.model";

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
  name: string;
  teams: (Types.ObjectId | DraftTeamDocument)[];
  draftOrder: (Types.ObjectId | DraftTeamDocument)[];
  timerOn: boolean;
  timerLength: number;
  draftStyle: "snake" | "linear";
  status: "PRE_DRAFT" | "IN_PROGRESS" | "COMPLETED";
  eventLog: DraftEventLog[];
  sourceTierList?: Types.ObjectId | DraftTierListDocument;
  activeTierList: {
    tierGroups: DraftTierGroup[];
  };
  rules: DraftRule[];
};

export type LeagueDivisionDocument = Document &
  LeagueDivision & { _id: Types.ObjectId };

const DraftRuleSchema: Schema<DraftRule> = new Schema(
  {
    header: { type: String, required: true },
    details: { type: String, required: true },
  },
  { _id: false }
);

const LeagueDivisionSchema: Schema<LeagueDivisionDocument> = new Schema(
  {
    name: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: DRAFT_TEAM_COLLECTION }],
    timerOn: { type: Boolean, default: true },
    timerLength: { type: Number, default: 90 },
    draftStyle: { type: String, enum: ["snake", "linear"], default: "snake" },
    status: {
      type: String,
      enum: ["PRE_DRAFT", "IN_PROGRESS", "COMPLETED"],
      default: "PRE_DRAFT",
    },

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
    sourceTierList: {
      type: Schema.Types.ObjectId,
      ref: DRAFT_TIER_LIST_COLLECTION,
    },
    activeTierList: {
      tierGroups: [DraftTierGroupSchema],
    },
    rules: [DraftRuleSchema],
  },
  { timestamps: true }
);

export default mongoose.model<LeagueDivisionDocument>(
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionSchema
);
