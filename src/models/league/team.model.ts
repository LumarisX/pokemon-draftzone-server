import mongoose, { Types, Schema } from "mongoose";
import { LeagueUserDocument, LEAGUE_USER_COLLECTION } from "./user.model";

export const DRAFT_TEAM_COLLECTION = "DraftTeam";

export type DraftTeamDocument = Document & {
  name: string;
  logoUrl?: string;
  coaches: (Types.ObjectId | LeagueUserDocument)[];
};

const DraftTeamSchema: Schema<DraftTeamDocument> = new Schema({
  name: { type: String, required: true },
  logoUrl: { type: String },
  coaches: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
});

export default mongoose.model<DraftTeamDocument>(DRAFT_TEAM_COLLECTION, DraftTeamSchema);
