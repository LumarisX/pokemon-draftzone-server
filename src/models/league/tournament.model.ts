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
import { LeagueTeamDocument } from "./team.model";

export type LeagueRule = {
  title: string;
  body: string;
};

export type LeagueTournamentForfeit = {
  gameDiff: number;
  pokemonDiff: number;
};

export type TournamentRound = {
  _id: Types.ObjectId;
  name: string;
  matchDeadline?: Date;
};

export type TournamentStage = {
  _id: Types.ObjectId;
  name: string;
  type: "round-robin" | "single-elimination" | "double-elimination" | "custom";
  rounds: TournamentRound[];
};

export type LeaguePlayoffs = {
  format: string;
  teams: (Types.ObjectId | LeagueTeamDocument)[];
  matches: BracketMatch[];
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
  playoffs: LeaguePlayoffs;
  stages: TournamentStage[];
};

type BracketSeedSlot = { type: "seed"; seed: number };
type BracketWinnerSlot = { type: "winner"; from: string };
type BracketSlot = BracketSeedSlot | BracketWinnerSlot;

type BracketMatch = {
  id: string;
  round: number;
  position: number;
  a: BracketSlot;
  b: BracketSlot;
  winner?: 0 | 1;
  replay?: string;
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

const TournamentRoundSchema = new Schema<TournamentRound>({
  name: { type: String, required: true },
  matchDeadline: { type: Date },
});

const TournamentStageSchema = new Schema<TournamentStage>({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["round-robin", "single-elimination", "double-elimination", "custom"],
    required: true,
  },
  rounds: [TournamentRoundSchema],
});

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

const BracketSlotSchema = new Schema<BracketSlot>(
  {
    type: { type: String, enum: ["seed", "winner"], required: true },
    seed: { type: Number },
    from: { type: String },
  },
  { _id: false },
);

const BracketMatchSchema = new Schema<BracketMatch>(
  {
    id: { type: String, required: true },
    round: { type: Number, required: true },
    position: { type: Number, required: true },
    a: { type: BracketSlotSchema, required: true },
    b: { type: BracketSlotSchema, required: true },
    winner: { type: Number, enum: [0, 1] },
    replay: { type: String },
  },
  { _id: false },
);

const LeaguePlayoffsSchema = new Schema<LeaguePlayoffs>(
  {
    format: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: "LeagueTeam" }],
    matches: [BracketMatchSchema],
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
    playoffs: {
      type: LeaguePlayoffsSchema,
      required: true,
    },
    stages: [TournamentStageSchema],
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
