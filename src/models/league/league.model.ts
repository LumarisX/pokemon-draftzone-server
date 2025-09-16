import mongoose, { Document, Schema, Types } from "mongoose";
import {
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionDocument,
} from "./division.model";
import { LEAGUE_USER_COLLECTION, LeagueUserDocument } from "./user.model";
import {
  DRAFT_TIER_LIST_COLLECTION,
  DraftTierListDocument,
} from "./tier-list.model";
import { LEAGUE_TEAM_COLLECTION, LeagueTeamDocument } from "./team.model";

export const LEAGUE_COLLECTION = "League";

export type LeagueRule = {
  header: string;
  details: string[];
};

export type League = {
  name: string;
  description?: string;
  coaches: (Types.ObjectId | LeagueUserDocument)[];
  divisions: (Types.ObjectId | LeagueDivisionDocument)[];
  owner: Types.ObjectId | LeagueUserDocument;
  organizers: (Types.ObjectId | LeagueUserDocument)[];
  tierList: Types.ObjectId | DraftTierListDocument;
  rules: LeagueRule[];
  teams: (Types.ObjectId | LeagueTeamDocument)[];
};

export type LeagueDocument = Document & League & { _id: Types.ObjectId };

const LeagueRuleSchema: Schema<LeagueRule> = new Schema(
  {
    header: { type: String, required: true },
    details: [{ type: String }],
  },
  { _id: false }
);

const LeagueSchema: Schema<LeagueDocument> = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    coaches: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
    divisions: [
      { type: Schema.Types.ObjectId, ref: LEAGUE_DIVISION_COLLECTION },
    ],
    owner: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_USER_COLLECTION,
      required: true,
    },
    organizers: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
    rules: [LeagueRuleSchema],
    tierList: {
      type: Schema.Types.ObjectId,
      ref: DRAFT_TIER_LIST_COLLECTION,
    },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
  },
  { timestamps: true }
);

export default mongoose.model<LeagueDocument>(LEAGUE_COLLECTION, LeagueSchema);
