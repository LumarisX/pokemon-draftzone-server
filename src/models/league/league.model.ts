import { HydratedDocument, model, Schema } from "mongoose";
import { LEAGUE_COLLECTION } from ".";

export type LeagueRule = {
  title: string;
  body: string;
};

export type League = {
  name: string;
  leagueKey: string;
  description?: string;
  owner: string;
  logo?: string;
};

export type LeagueDocument = HydratedDocument<League>;

const LeagueSchema: Schema<League> = new Schema(
  {
    name: { type: String, required: true },
    leagueKey: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    owner: { type: String, required: true },

    logo: { type: String },
  },
  { timestamps: true },
);

export default model<League>(LEAGUE_COLLECTION, LeagueSchema);
