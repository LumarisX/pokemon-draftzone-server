import mongoose, { Types, Schema, Document } from "mongoose";
import { LeagueUserDocument, LEAGUE_USER_COLLECTION } from "./user.model";

export const DRAFT_TEAM_COLLECTION = "DraftTeam";

export type DraftPick = {
  timestamp: Date;
  pokemonId: string;
  picker: Types.ObjectId | LeagueUserDocument;
};

export type DraftTeam = {
  name: string;
  logoUrl?: string;
  coaches: (Types.ObjectId | LeagueUserDocument)[];
  picks: DraftPick[];
};

export type DraftTeamDocument = Document & DraftTeam & { _id: Types.ObjectId };

const DraftPickSchema: Schema<DraftPick> = new Schema(
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

const DraftTeamSchema: Schema<DraftTeamDocument> = new Schema({
  name: { type: String, required: true },
  logoUrl: { type: String },
  coaches: [{ type: Schema.Types.ObjectId, ref: LEAGUE_USER_COLLECTION }],
  picks: [DraftPickSchema],
});

export default mongoose.model<DraftTeamDocument>(
  DRAFT_TEAM_COLLECTION,
  DraftTeamSchema
);
