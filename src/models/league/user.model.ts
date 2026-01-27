import mongoose, { Schema, Document, Types } from "mongoose";

export const LEAGUE_USER_COLLECTION = "LeagueUser";

export type SignupInfo = {
  leagueId: Types.ObjectId;
  teamName: string;
  logoFileKey?: string; // S3 file key for team logo in this league
  experience: string;
  droppedBefore: boolean;
  droppedWhy?: string;
  confirmed: boolean;
  status: "approved" | "pending" | "denied";
  signedUpAt: Date;
};

export type LeagueUser = {
  auth0Id: string;
  timezone?: string;
  discordName?: string;
  discordId?: string;
  showdownName?: string;
  signups?: SignupInfo[];
};

export type LeagueUserDocument = Document &
  LeagueUser & { _id: Types.ObjectId };

const SignupInfoSchema: Schema<SignupInfo> = new Schema(
  {
    leagueId: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    teamName: { type: String, required: true },
    logoFileKey: { type: String, index: true },
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
  { _id: false },
);

const LeagueUserSchema: Schema<LeagueUserDocument> = new Schema(
  {
    auth0Id: { type: String, required: true, unique: true, index: true },
    timezone: { type: String },
    discordName: { type: String },
    discordId: { type: String },
    showdownName: { type: String },
    signups: [SignupInfoSchema],
  },
  { timestamps: true },
);

export default mongoose.model<LeagueUserDocument>(
  LEAGUE_USER_COLLECTION,
  LeagueUserSchema,
);
