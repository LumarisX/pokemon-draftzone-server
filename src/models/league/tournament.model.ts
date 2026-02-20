import mongoose, { Document, Schema, Types } from "mongoose";
import {
  LEAGUE_COLLECTION,
  LEAGUE_TIER_LIST_COLLECTION,
  LEAGUE_TOURNAMENT_COLLECTION,
} from ".";
import { LeagueDocument } from "./league.model";
import { LeagueTierListDocument } from "./tier-list.model";

export type LeagueRule = {
  title: string;
  body: string;
};

export type LeagueTournament = {
  name: string;
  tournamentKey: string;
  description?: string;
  format: string;
  ruleset: string;
  signUpDeadline: Date;
  draftStart?: Date;
  draftEnd?: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  owner: string;
  organizers: string[];
  tierList: Types.ObjectId | LeagueTierListDocument;
  rules: LeagueRule[];
  logo?: string;
  discord?: string;
  league: Types.ObjectId | LeagueDocument;
};

export type LeagueTournamentDocument = Document &
  LeagueTournament & { _id: Types.ObjectId };

const LeagueRuleSchema: Schema<LeagueRule> = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
  },
  { _id: false },
);

const LeagueTournamentSchema: Schema<LeagueTournamentDocument> = new Schema(
  {
    name: { type: String, required: true },
    tournamentKey: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
    signUpDeadline: { type: Date, required: true },
    draftStart: { type: Date },
    draftEnd: { type: Date },
    seasonStart: { type: Date },
    seasonEnd: { type: Date },
    owner: { type: String, required: true },
    organizers: [{ type: String }],
    rules: [LeagueRuleSchema],
    tierList: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TIER_LIST_COLLECTION,
    },
    logo: { type: String },
    discord: { type: String },
    league: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COLLECTION,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueTournamentDocument>(
  LEAGUE_TOURNAMENT_COLLECTION,
  LeagueTournamentSchema,
);
