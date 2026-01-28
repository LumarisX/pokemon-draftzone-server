import mongoose, { Document, Schema, Types } from "mongoose";
import {
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionDocument,
} from "./division.model";
import { LEAGUE_TEAM_COLLECTION, LeagueTeamDocument } from "./team.model";
import {
  LEAGUE_TIER_LIST_COLLECTION,
  LeagueTierListDocument,
} from "./tier-list.model";
import { LEAGUE_USER_COLLECTION, LeagueUserDocument } from "./user.model";

export const LEAGUE_COLLECTION = "League";

export type LeagueRule = {
  title: string;
  body: string;
};

export type League = {
  name: string;
  leagueKey: string;
  description?: string;
  format: string;
  ruleset: string;
  signUpDeadline: Date;
  draftStart?: Date;
  draftEnd?: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  coaches: (Types.ObjectId | LeagueUserDocument)[];
  divisions: (Types.ObjectId | LeagueDivisionDocument)[];
  owner: Types.ObjectId | LeagueUserDocument;
  organizers: (Types.ObjectId | LeagueUserDocument)[];
  tierList: Types.ObjectId | LeagueTierListDocument;
  rules: LeagueRule[];
  teams: (Types.ObjectId | LeagueTeamDocument)[];
  logo?: string;
  discord?: string;
};

export type LeagueDocument = Document & League & { _id: Types.ObjectId };

const LeagueRuleSchema: Schema<LeagueRule> = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
  },
  { _id: false },
);

const LeagueSchema: Schema<LeagueDocument> = new Schema(
  {
    name: { type: String, required: true },
    leagueKey: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
    signUpDeadline: { type: Date, required: true },
    draftStart: { type: Date },
    draftEnd: { type: Date },
    seasonStart: { type: Date },
    seasonEnd: { type: Date },
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
      ref: LEAGUE_TIER_LIST_COLLECTION,
    },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
    logo: { type: String },
    discord: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueDocument>(LEAGUE_COLLECTION, LeagueSchema);
