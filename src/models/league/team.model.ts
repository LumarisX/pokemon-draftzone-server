import mongoose, { Types, Schema, Document } from "mongoose";
import { LeagueUserDocument, LEAGUE_USER_COLLECTION } from "./user.model";
import { captSchema } from "../pokemon.schema";
import { TypeName } from "@pkmn/data";

export const LEAGUE_TEAM_COLLECTION = "LeagueTeam";

export type TeamDraft = {
  timestamp: Date;
  pokemonId: string;
  picker: Types.ObjectId | LeagueUserDocument;
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
};

export type LeagueTeam = {
  name: string;
  logo?: string;
  coach: Types.ObjectId | LeagueUserDocument;
  picks: string[][];
  draft: TeamDraft[];
  timezone?: string;
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
    capt: {
      type: captSchema,
    },
  },
  { _id: false },
);

const LeagueTeamSchema: Schema<LeagueTeamDocument> = new Schema({
  name: { type: String, required: true },
  logo: { type: String },
  coach: {
    type: Schema.Types.ObjectId,
    ref: LEAGUE_USER_COLLECTION,
    required: true,
  },
  picks: [[{ type: String }]],
  draft: [TeamDraftSchema],
});

export default mongoose.model<LeagueTeamDocument>(
  LEAGUE_TEAM_COLLECTION,
  LeagueTeamSchema,
);
