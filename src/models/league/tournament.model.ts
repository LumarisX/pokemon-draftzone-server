import {
  HydratedDocument,
  model,
  Model,
  QueryWithHelpers,
  Schema,
  Types,
} from "mongoose";
import {
  LEAGUE_COLLECTION,
  LEAGUE_TIER_LIST_COLLECTION,
  LEAGUE_TOURNAMENT_COLLECTION,
} from ".";
import { LeagueDocument } from "./league.model";
import { LeagueTierListDocument } from "./tier-list.model";

export type LeagueRule = {
  title: string;
  body: string;
};

export type LeagueTournamentForfeit = {
  gameDiff: number;
  pokemonDiff: number;
};

export type LeagueTournament = {
  name: string;
  tournamentKey: string;
  description?: string;
  format: string;
  ruleset: string;
  signUpDeadline: Date;
  draftStart?: Date;
  draftEnd?: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  owner: string;
  organizers: string[];
  tierList: Types.ObjectId | LeagueTierListDocument;
  rules: LeagueRule[];
  logo?: string;
  discord?: string;
  league: Types.ObjectId | LeagueDocument;
  forfeit: LeagueTournamentForfeit;
  diffMode: "pokemon" | "game";
};

export type LeagueTournamentDocument = HydratedDocument<LeagueTournament>;

type TournamentQueryHelpers = {
  withTierList(
    this: QueryWithHelpers<
      any,
      LeagueTournamentDocument,
      TournamentQueryHelpers
    >,
  ): QueryWithHelpers<any, LeagueTournamentDocument, TournamentQueryHelpers>;
};

type LeagueTournamentModel = Model<
  LeagueTournament,
  TournamentQueryHelpers,
  {},
  {},
  LeagueTournamentDocument
> & {
  findByKeyOrThrow(key: string): Promise<LeagueTournamentDocument>;
};

const LeagueTournamentForfeitSchema = new Schema<LeagueTournamentForfeit>(
  {
    gameDiff: { type: Number, required: true, default: 0 },
    pokemonDiff: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const LeagueRuleSchema: Schema<LeagueRule> = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
  },
  { _id: false },
);

const LeagueTournamentSchema: Schema<
  LeagueTournament,
  LeagueTournamentModel,
  {},
  TournamentQueryHelpers
> = new Schema(
  {
    name: { type: String, required: true },
    tournamentKey: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
    signUpDeadline: { type: Date, required: true },
    draftStart: { type: Date },
    draftEnd: { type: Date },
    seasonStart: { type: Date },
    seasonEnd: { type: Date },
    owner: { type: String, required: true },
    organizers: [{ type: String }],
    rules: [LeagueRuleSchema],
    tierList: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TIER_LIST_COLLECTION,
    },
    logo: { type: String },
    discord: { type: String },
    league: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COLLECTION,
      required: true,
    },
    forfeit: {
      type: LeagueTournamentForfeitSchema,
      required: true,
    },
    diffMode: {
      type: String,
      enum: ["pokemon", "game"],
      required: true,
    },
  },
  { timestamps: true },
);

LeagueTournamentSchema.query.withTierList = function () {
  return this.populate("tierList");
};

LeagueTournamentSchema.statics.findByKeyOrThrow = async function (key: string) {
  const tournament = await this.findOne({ tournamentKey: key });
  if (!tournament) {
    throw new Error(`LeagueTournament not found for key: ${key}`);
  }
  return tournament;
};

export default model<LeagueTournament, LeagueTournamentModel>(
  LEAGUE_TOURNAMENT_COLLECTION,
  LeagueTournamentSchema,
);
