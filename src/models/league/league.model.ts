import mongoose, { Document, Schema, Types } from "mongoose";
import { LEAGUE_COACH_COLLECTION, LEAGUE_COLLECTION } from ".";
import { LeagueCoachDocument } from "./coach.model";

export type LeagueRule = {
  title: string;
  body: string;
};

export type League = {
  name: string;
  leagueKey: string;
  description?: string;
  owner: Types.ObjectId | LeagueCoachDocument;
  logo?: string;
};

export type LeagueDocument = Document & League & { _id: Types.ObjectId };

const LeagueSchema: Schema<LeagueDocument> = new Schema(
  {
    name: { type: String, required: true },
    leagueKey: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    owner: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COACH_COLLECTION,
      required: true,
    },

    logo: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueDocument>(LEAGUE_COLLECTION, LeagueSchema);
