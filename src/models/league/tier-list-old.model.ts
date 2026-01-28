import mongoose, { Schema, Types, Document } from "mongoose";
import { LEAGUE_USER_COLLECTION, LeagueUserDocument } from "./user.model";

export const DRAFT_TIER_LIST_COLLECTION = "DraftTierList";

export type DraftTier = {
  name: string;
  order: number;
  labels: string[];
  pokemon: string[];
};

export type DraftTierGroup = {
  name: string;
  order: number;
  tiers: DraftTier[];
};

export type DraftTierList = {
  name: string;
  description?: string;
  createdBy: Types.ObjectId | LeagueUserDocument;
  tierGroups: DraftTierGroup[];
  bannedMoves: string[];
  bannedAbilities: string[];
  points: number;
  draftCount: [number, number];
  format: string;
  ruleset: string;
};

export type DraftTierListDocument = Document &
  DraftTierList & { _id: Types.ObjectId };

export const DraftTierSchema: Schema<DraftTier> = new Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, required: true },
    labels: [{ type: String }],
    pokemon: [{ type: String }],
  },
  { _id: false }
);

export const DraftTierGroupSchema: Schema<DraftTierGroup> = new Schema(
  {
    name: { type: String },
    order: { type: Number, required: true },
    tiers: [DraftTierSchema],
  },
  { _id: false }
);

const DraftTierListSchema: Schema<DraftTierListDocument> = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_USER_COLLECTION,
      required: true,
    },
    tierGroups: [DraftTierGroupSchema],
    bannedMoves: [{ type: String }],
    bannedAbilities: [{ type: String }],
    points: { type: Number },
    draftCount: [{ type: Number }],
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<DraftTierListDocument>(
  DRAFT_TIER_LIST_COLLECTION,
  DraftTierListSchema
);
