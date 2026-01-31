import mongoose, { Types, Schema, Document } from "mongoose";
import { LeagueCoachDocument, LEAGUE_COACH_COLLECTION } from "./coach.model";
import { captSchema } from "../pokemon.schema";
import { TypeName } from "@pkmn/data";

export const LEAGUE_TEAM_COLLECTION = "LeagueTeam";

export type TeamDraft = {
  timestamp: Date;
  pokemonId: string;
  picker: Types.ObjectId | LeagueCoachDocument;
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
};

export type LeagueTeam = {
  coach: Types.ObjectId | LeagueCoachDocument;
  picks: string[][];
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
      ref: LEAGUE_COACH_COLLECTION,
      required: true,
    },
    capt: {
      type: captSchema,
    },
  },
  { _id: false },
);

const LeagueTeamSchema: Schema<LeagueTeamDocument> = new Schema({
  coach: {
    type: Schema.Types.ObjectId,
    ref: LEAGUE_COACH_COLLECTION,
    required: true,
  },
  picks: [[{ type: String }]],
  draft: [TeamDraftSchema],
});

export default mongoose.model<LeagueTeamDocument>(
  LEAGUE_TEAM_COLLECTION,
  LeagueTeamSchema,
);
