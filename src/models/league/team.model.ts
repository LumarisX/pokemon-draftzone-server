import { TypeName } from "@pkmn/data";
import mongoose, { Document, Schema, Types } from "mongoose";
import { captSchema, PokemonData, pokemonSchema } from "../pokemon.schema";
import { LeagueCoachDocument } from "./coach.model";
import { LEAGUE_COACH_COLLECTION, LEAGUE_TEAM_COLLECTION } from ".";

export type TeamDraft = {
  timestamp: Date;
  pokemon: PokemonData;
  addons?: string[];
  picker: Types.ObjectId | LeagueCoachDocument;
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
};

export type TeamPick = {
  pokemonId: string;
  addons?: string[];
};

export type LeagueTeam = {
  coach: Types.ObjectId | LeagueCoachDocument;
  picks: TeamPick[][];
  draft: TeamDraft[];
  skipCount: number;
};

export type LeagueTeamDocument = Document &
  LeagueTeam & { _id: Types.ObjectId };

const TeamDraftSchema: Schema<TeamDraft> = new Schema(
  {
    pokemon: {
      type: pokemonSchema,
      required: true,
    },
    addons: [{ type: String }],
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

const TeamPicksSchema: Schema<TeamPick> = new Schema(
  {
    pokemonId: { type: String, required: true },
    addons: [{ type: String }],
  },
  { _id: false },
);

const LeagueTeamSchema: Schema<LeagueTeamDocument> = new Schema({
  coach: {
    type: Schema.Types.ObjectId,
    ref: LEAGUE_COACH_COLLECTION,
    required: true,
  },
  picks: [[TeamPicksSchema]],
  draft: [TeamDraftSchema],
  skipCount: { type: Number, default: 0 },
});

export default mongoose.model<LeagueTeamDocument>(
  LEAGUE_TEAM_COLLECTION,
  LeagueTeamSchema,
);
