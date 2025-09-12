import { DraftTeamDocument, DRAFT_TEAM_COLLECTION } from "./team.model";
import { LeagueUserDocument, LEAGUE_USER_COLLECTION } from "./user.model";
import { LeagueDraftDocument, LEAGUE_DRAFT_COLLECTION } from "./draft.model";
import mongoose, { Types, Schema } from "mongoose";

export const LEAGUE_COLLECTION = "League";

export type LeagueDocument = Document & {
  name: string;
  description?: string;
  teams: (Types.ObjectId | DraftTeamDocument)[];
  coaches: (Types.ObjectId | LeagueUserDocument)[];
  drafts: (Types.ObjectId | LeagueDraftDocument)[];
  commissioner: Types.ObjectId | LeagueUserDocument;
};

const LeagueSchema: Schema<LeagueDocument> = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    teams: [{ type: Schema.Types.ObjectId, ref: DRAFT_TEAM_COLLECTION }],
    coaches: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
    drafts: [{ type: Schema.Types.ObjectId, ref: LEAGUE_DRAFT_COLLECTION }],
    commissioner: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_USER_COLLECTION,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<LeagueDocument>(LEAGUE_COLLECTION, LeagueSchema);