import mongoose, { Schema, Document, Types } from "mongoose";

export const LEAGUE_COACH_COLLECTION = "LeagueCoaches";

export type LeagueCoach = {
  auth0Id: string;
  timezone?: string;
  discordName: string;
  showdownName?: string;
  leagueId: Types.ObjectId;
  teamName: string;
  logo?: string;
  experience: string;
  droppedBefore: boolean;
  droppedWhy?: string;
  confirmed: boolean;
  status: "approved" | "pending" | "denied";
  signedUpAt: Date;
};

export type LeagueCoachDocument = Document &
  LeagueCoach & { _id: Types.ObjectId };

const LeagueCoachSchema: Schema<LeagueCoachDocument> = new Schema(
  {
    auth0Id: { type: String, required: true },
    timezone: { type: String },
    discordName: { type: String },
    showdownName: { type: String },
    leagueId: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    teamName: { type: String, required: true },
    logo: { type: String, index: true },
    experience: { type: String, required: true },
    droppedBefore: { type: Boolean, required: true, default: false },
    droppedWhy: { type: String },
    confirmed: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      enum: ["approved", "pending", "denied"],
      default: "pending",
    },
    signedUpAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueCoachDocument>(
  LEAGUE_COACH_COLLECTION,
  LeagueCoachSchema,
);
