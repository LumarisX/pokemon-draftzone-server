import mongoose, { Types, Schema } from "mongoose";
import { DraftTeamDocument, DRAFT_TEAM_COLLECTION } from "./team.model";

export const LEAGUE_USER_COLLECTION = "LeagueUser";

export type CoachProfile = {
  status: "active" | "inactive" | "pending_approval" | "banned";
  timezone?: string;
  discordName?: string;
  showdownName?: string;
  teams: (Types.ObjectId | DraftTeamDocument)[];
};

export type LeagueUserDocument = Document & {
  auth0Id: string;
  email: string;
  username: string;
  coachProfile: CoachProfile;
};

const LeagueUserSchema: Schema<LeagueUserDocument> = new Schema(
  {
    auth0Id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    username: { type: String, required: true },
    coachProfile: {
      status: {
        type: String,
        enum: ["active", "inactive", "pending_approval", "banned"],
        default: "inactive",
      },
      timezone: { type: String },
      discordName: { type: String },
      showdownName: { type: String },
      teams: [{ type: Schema.Types.ObjectId, ref: DRAFT_TEAM_COLLECTION }],
    },
  },
  { timestamps: true }
);

export default mongoose.model<LeagueUserDocument>(
  LEAGUE_USER_COLLECTION,
  LeagueUserSchema
);
