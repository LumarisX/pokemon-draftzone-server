import mongoose, { Schema, Types } from "mongoose";
import { DRAFT_TEAM_COLLECTION, DraftTeamDocument } from "./team.model";
import {
  DRAFT_TIER_LIST_TEMPLATE_COLLECTION,
  DraftTierGroup,
  DraftTierGroupSchema,
  DraftTierListTemplateDocument,
} from "./tier-list-template.model";

export const LEAGUE_DRAFT_COLLECTION = "LeagueDraft";

export type DraftEventLog = {
  eventType: "PICK" | "SKIP" | "TIMER_START" | "TIMER_PAUSE";
  details?: string;
  timestamp: Date;
};

export type DraftPick = {
  pickNumber: number;
  team: Types.ObjectId | DraftTeamDocument;
  pokemon?: string;
  tier?: string;
  isSkipped: boolean;
  timestamp: Date;
};

export type LeagueDraftDocument = Document & {
  name: string;
  timerOn: boolean;
  timerLength: number;
  draftStyle: "snake" | "linear";
  status: "PRE_DRAFT" | "IN_PROGRESS" | "COMPLETED";
  participatingTeams: (Types.ObjectId | DraftTeamDocument)[];
  picks: DraftPick[];
  eventLog: DraftEventLog[];
  sourceTierListTemplate?: Types.ObjectId | DraftTierListTemplateDocument;
  activeTierList: {
    tierGroups: DraftTierGroup[];
  };
};

const DraftPickSchema: Schema<DraftPick> = new Schema(
  {
    pickNumber: { type: Number, required: true },
    team: {
      type: Schema.Types.ObjectId,
      ref: DRAFT_TEAM_COLLECTION,
      required: true,
    },
    pokemon: { type: String },
    tier: { type: String },
    isSkipped: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LeagueDraftSchema: Schema<LeagueDraftDocument> = new Schema(
  {
    name: { type: String, required: true },
    timerOn: { type: Boolean, default: true },
    timerLength: { type: Number, default: 90 },
    draftStyle: { type: String, enum: ["snake", "linear"], default: "snake" },
    status: {
      type: String,
      enum: ["PRE_DRAFT", "IN_PROGRESS", "COMPLETED"],
      default: "PRE_DRAFT",
    },
    participatingTeams: [
      { type: Schema.Types.ObjectId, ref: DRAFT_TEAM_COLLECTION },
    ],
    picks: [DraftPickSchema],
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
    sourceTierListTemplate: {
      type: Schema.Types.ObjectId,
      ref: DRAFT_TIER_LIST_TEMPLATE_COLLECTION,
    },
    activeTierList: {
      tierGroups: [DraftTierGroupSchema],
    },
  },
  { timestamps: true }
);

export default mongoose.model<LeagueDraftDocument>(
  LEAGUE_DRAFT_COLLECTION,
  LeagueDraftSchema
);
