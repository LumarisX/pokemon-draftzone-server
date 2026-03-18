import {
  ClientSession,
  HydratedDocument,
  model,
  Model,
  QueryWithHelpers,
  Schema,
  Types,
} from "mongoose";
import { LEAGUE_COACH_COLLECTION, LEAGUE_TEAM_COLLECTION } from ".";
import { PokemonData, pokemonSchema } from "../pokemon.schema";
import { LeagueCoachDocument } from "./coach.model";

export type TeamDraft = {
  timestamp: Date;
  pokemon: PokemonData;
  addons?: string[];
  picker: Types.ObjectId | LeagueCoachDocument;
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

export type LeagueTeamDocument = HydratedDocument<LeagueTeam, TeamMethods>;

export type PopulatedLeagueTeamDocument = LeagueTeamDocument & {
  coach: LeagueCoachDocument;
};

type TeamMethods = {
  incrementSkipCount(session?: ClientSession): Promise<void>;
  draftedPokemonIds(): string[];
  draftedAsIdObjects(): { id: string }[];
  draftedAsPokemonIdObjects(): { pokemonId: string }[];
};

type LeagueTeamModel = Model<
  LeagueTeam,
  {},
  TeamMethods,
  {},
  LeagueTeamDocument
> & {
  findByCoachIds(
    coachIds: (Types.ObjectId | string)[],
  ): QueryWithHelpers<LeagueTeamDocument[], LeagueTeamDocument>;
  findIdsByCoachIds(
    coachIds: (Types.ObjectId | string)[],
  ): Promise<Types.ObjectId[]>;
  findByIdWithCoach(
    id: Types.ObjectId | string,
  ): Promise<PopulatedLeagueTeamDocument | null>;
};

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

const LeagueTeamSchema: Schema<LeagueTeam, LeagueTeamModel, TeamMethods> =
  new Schema({
    coach: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COACH_COLLECTION,
      required: true,
    },
    picks: [[TeamPicksSchema]],
    draft: [TeamDraftSchema],
    skipCount: { type: Number, default: 0 },
  });

LeagueTeamSchema.methods.incrementSkipCount = async function (
  session?: ClientSession,
) {
  this.skipCount = (this.skipCount || 0) + 1;
  await this.save(session ? { session } : undefined);
};

LeagueTeamSchema.methods.draftedPokemonIds = function () {
  return this.draft.map((draftPick) => draftPick.pokemon.id);
};

LeagueTeamSchema.methods.draftedAsIdObjects = function () {
  return this.draft.map((draftPick) => ({ id: draftPick.pokemon.id }));
};

LeagueTeamSchema.methods.draftedAsPokemonIdObjects = function () {
  return this.draft.map((draftPick) => ({ pokemonId: draftPick.pokemon.id }));
};

LeagueTeamSchema.statics.findByCoachIds = function (
  coachIds: (Types.ObjectId | string)[],
) {
  return this.find({ coach: { $in: coachIds } });
};

LeagueTeamSchema.statics.findIdsByCoachIds = async function (
  coachIds: (Types.ObjectId | string)[],
) {
  const teams = await this.find({ coach: { $in: coachIds } }).select("_id");
  return teams.map((team) => team._id as Types.ObjectId);
};

LeagueTeamSchema.statics.findByIdWithCoach = async function (
  id: Types.ObjectId | string,
) {
  return this.findById(id).populate<{ coach: LeagueCoachDocument }>("coach");
};

export default model<LeagueTeam, LeagueTeamModel>(
  LEAGUE_TEAM_COLLECTION,
  LeagueTeamSchema,
);
