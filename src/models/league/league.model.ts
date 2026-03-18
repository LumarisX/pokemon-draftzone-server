import { HydratedDocument, model, Schema, Types } from "mongoose";
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

export type LeagueDocument = HydratedDocument<League>;

const LeagueSchema: Schema<League> = new Schema(
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

export default model<League>(LEAGUE_COLLECTION, LeagueSchema);
