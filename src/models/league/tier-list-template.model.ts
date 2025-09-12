import mongoose, { Schema, Types } from "mongoose";
import { LEAGUE_USER_COLLECTION, LeagueUserDocument } from "./user.model";

export const DRAFT_TIER_LIST_TEMPLATE_COLLECTION = "DraftTierListTemplate";

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

export type DraftTierListTemplateDocument = Document & {
  name: string;
  description?: string;
  createdBy: Types.ObjectId | LeagueUserDocument;
  tierGroups: DraftTierGroup[];
  bannedMoves: string[];
  bannedAbilities: string[];
  divisions: string[];
};

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

const DraftTierListTemplateSchema: Schema<DraftTierListTemplateDocument> =
  new Schema(
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
      divisions: [{ type: String }],
    },
    { timestamps: true }
  );

export default mongoose.model<DraftTierListTemplateDocument>(
  DRAFT_TIER_LIST_TEMPLATE_COLLECTION,
  DraftTierListTemplateSchema
);
