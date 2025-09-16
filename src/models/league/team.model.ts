import mongoose, { Types, Schema, Document } from "mongoose";
import { LeagueUserDocument, LEAGUE_USER_COLLECTION } from "./user.model";

export const LEAGUE_TEAM_COLLECTION = "LeagueTeam";

export type TeamDraft = {
  timestamp: Date;
  pokemonId: string;
  picker: Types.ObjectId | LeagueUserDocument;
};

export type TeamPicks = {};

export type LeagueTeam = {
  name: string;
  teamId: string;
  logoUrl?: string;
  coaches: (Types.ObjectId | LeagueUserDocument)[];
  picks: TeamPicks[];
  draft: TeamDraft[];
};

export type LeagueTeamDocument = Document &
  LeagueTeam & { _id: Types.ObjectId };

const TeamDraftSchema: Schema<TeamDraft> = new Schema(
  {
    pokemonId: {
      type: String,
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    picker: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_USER_COLLECTION,
      required: true,
    },
  },
  { _id: false }
);
const TeamPicksSchema: Schema<TeamPicks> = new Schema({}, { _id: false });

const LeagueTeamSchema: Schema<LeagueTeamDocument> = new Schema({
  name: { type: String, required: true },
  teamId: { type: String, required: true, unique: true, index: true },
  logoUrl: { type: String },
  coaches: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
  picks: [TeamPicksSchema],
  draft: [TeamDraftSchema],
});

export default mongoose.model<LeagueTeamDocument>(
  LEAGUE_TEAM_COLLECTION,
  LeagueTeamSchema
);
