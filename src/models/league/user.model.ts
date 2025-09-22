import mongoose, { Schema, Document, Types } from "mongoose";

export const LEAGUE_USER_COLLECTION = "LeagueUser";

export type LeagueUser = {
  auth0Id: string;
  status: "active" | "inactive" | "pending_approval" | "banned";
  timezone?: string;
  discordName?: string;
  discordId?: string;
  showdownName?: string;
};

export type LeagueUserDocument = Document &
  LeagueUser & { _id: Types.ObjectId };

const LeagueUserSchema: Schema<LeagueUserDocument> = new Schema(
  {
    auth0Id: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["active", "inactive", "pending_approval", "banned"],
      default: "inactive",
    },
    timezone: { type: String },
    discordName: { type: String },
    discordId: { type: String },
    showdownName: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<LeagueUserDocument>(
  LEAGUE_USER_COLLECTION,
  LeagueUserSchema
);
