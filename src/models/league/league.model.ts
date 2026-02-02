import mongoose, { Document, Schema, Types } from "mongoose";
import { LEAGUE_COACH_COLLECTION, LeagueCoachDocument } from "./coach.model";
import {
  LEAGUE_TOURNAMENT_COLLECTION,
  LeagueTournamentDocument,
} from "./tournament.model";

export const LEAGUE_COLLECTION = "Leagues";

export type LeagueRule = {
  title: string;
  body: string;
};

export type League = {
  name: string;
  leagueKey: string;
  description?: string;
  owner: Types.ObjectId | LeagueCoachDocument;
  tournaments: (Types.ObjectId | LeagueTournamentDocument)[];
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
    tournaments: [
      { type: Schema.Types.ObjectId, ref: LEAGUE_TOURNAMENT_COLLECTION },
    ],
    logo: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueDocument>(LEAGUE_COLLECTION, LeagueSchema);
