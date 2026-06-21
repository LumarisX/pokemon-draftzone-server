import {
  HydratedDocument,
  model,
  Schema,
  Types,
  Model,
  QueryWithHelpers,
} from "mongoose";
import { LeagueTeamDocument } from "./team.model";
import {
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
  LEAGUE_TOURNAMENT_COLLECTION,
} from ".";
import { LeagueTournamentDocument } from "./tournament.model";

export type DraftRule = {
  header: string;
  details: string;
};

export type DraftEventLog = {
  eventType: "PICK" | "SKIP" | "TIMER_START" | "TIMER_PAUSE";
  details?: string;
  timestamp: Date;
};

export type LeagueDraft = {
  status: "PRE_DRAFT" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  sequentialTurns: boolean;
  orderProgression: "snake" | "linear";
  remainingTime?: number;
  counter: number;
  eventLog: DraftEventLog[];
  skipTimerPenalty: number;
  skipTime?: Date;
  channelId?: string;
  timerLength: number;
  useRandomSeeding?: boolean;
  visibility: "ALL" | "SELF";
  allowRemovals: boolean;
};

export type LeagueDivision = {
  divisionKey: string;
  name: string;
  teams: (Types.ObjectId | LeagueTeamDocument)[];
  public: boolean;
  tournament: Types.ObjectId | LeagueTournamentDocument;
  trades: DraftTrade[];
  currentStage: number;
  stages: LeagueStageDocument[];
  draft: LeagueDraft;
};

export type TradeSide = {
  team?: Types.ObjectId | LeagueTeamDocument;
  pokemon: { id: string; addons?: string[] }[];
};

export type DraftTrade = {
  side1: TradeSide;
  side2: TradeSide;
  timestamp: Date;
  activeStage: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export type LeagueStageData = {
  division: LeagueDivisionDocument | Types.ObjectId;
  name: string;
  matchDeadline?: Date;
  tradeDeadline?: Date;
};

export type LeagueStageDocument = HydratedDocument<LeagueStageData>;

const LeagueStageSchema = new Schema<LeagueStageData>(
  {
    division: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_DIVISION_COLLECTION,
      required: true,
    },
    name: { type: String, required: true },
  },
  { timestamps: true },
);

const TradeSideSchema = new Schema<TradeSide>(
  {
    team: { type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION },
    pokemon: {
      type: [
        {
          id: { type: String, required: true },
          addons: { type: [String] },
        },
      ],
      required: true,
    },
  },
  { _id: false },
);

const TradeSchema = new Schema<DraftTrade>(
  {
    side1: { type: TradeSideSchema, required: true },
    side2: { type: TradeSideSchema, required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    activeStage: { type: Number, default: -1 },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
    },
  },
  { _id: false },
);

const LeagueDraftSchema = new Schema<LeagueDraft>({
  skipTime: { type: Date },
  channelId: { type: String },
  timerLength: { type: Number },
  skipTimerPenalty: { type: Number, default: 30 },
  remainingTime: { type: Number },
  orderProgression: {
    type: String,
    enum: ["snake", "linear"],
    default: "snake",
  },
  status: {
    type: String,
    enum: ["PRE_DRAFT", "IN_PROGRESS", "PAUSED", "COMPLETED"],
    default: "PRE_DRAFT",
  },
  counter: { type: Number, default: 0 },
  eventLog: [
    {
      eventType: {
        type: String,
        enum: ["PICK", "SKIP", "TIMER_START", "TIMER_PAUSE"],
      },
      details: { type: String },
      timestamp: { type: Date, default: Date.now },
    },
  ],
  useRandomSeeding: { type: Boolean, default: true },
  sequentialTurns: { type: Boolean, default: true },
  visibility: {
    type: String,
    enum: ["ALL", "SELF"],
    default: "ALL",
  },
  allowRemovals: { type: Boolean, default: false },
});

export type LeagueDivisionDocument = HydratedDocument<
  LeagueDivision,
  DivisionMethods
>;

type DivisionMethods = {
  includesTeamId(teamId: Types.ObjectId | string): boolean;
  firstMatchingTeamId(
    teamIds: (Types.ObjectId | string)[],
  ): Types.ObjectId | undefined;
};

type DivisionQueryHelpers = {
  forTournament(
    this: QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>,
    tournamentId: Types.ObjectId | string,
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  byDivisionKeys(
    this: QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>,
    keys: string[],
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  withTeamIds(
    this: QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>,
    teamIds: (Types.ObjectId | string)[],
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  isPublic(
    this: QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>,
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  withTournamentLeagueTierList(
    this: QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>,
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
};

type LeagueDivisionModel = Model<
  LeagueDivision,
  DivisionQueryHelpers,
  DivisionMethods,
  {},
  LeagueDivisionDocument
> & {
  findPublicByTeamIds(
    teamIds: (Types.ObjectId | string)[],
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  findPublicByTeamIdsWithTournament(
    teamIds: (Types.ObjectId | string)[],
  ): Promise<LeagueDivisionDocument[]>;
};

const LeagueDivisionSchema: Schema<
  LeagueDivision,
  LeagueDivisionModel,
  DivisionMethods,
  DivisionQueryHelpers
> = new Schema(
  {
    divisionKey: { type: String, required: true },
    name: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
    public: { type: Boolean, default: false },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TOURNAMENT_COLLECTION,
      required: true,
    },
    trades: { type: [TradeSchema], default: [] },
    currentStage: { type: Number, default: -1 },
    stages: { type: [LeagueStageSchema], default: [] },
    draft: {
      type: LeagueDraftSchema,
      required: true,
    },
  },
  { timestamps: true },
);

LeagueDivisionSchema.index({ tournament: 1, divisionKey: 1 }, { unique: true });
LeagueDivisionSchema.index({ teams: 1 }, { unique: true });

LeagueDivisionSchema.query.forTournament = function (
  tournamentId: Types.ObjectId | string,
) {
  return this.where({ tournament: tournamentId });
};

LeagueDivisionSchema.query.byDivisionKeys = function (keys: string[]) {
  return this.where({ divisionKey: { $in: keys } });
};

LeagueDivisionSchema.query.withTeamIds = function (
  teamIds: (Types.ObjectId | string)[],
) {
  return this.where({ teams: { $in: teamIds } });
};

LeagueDivisionSchema.query.isPublic = function () {
  return this.where({ public: true });
};

LeagueDivisionSchema.query.withTournamentLeagueTierList = function () {
  return this.populate({
    path: "tournament",
    populate: [{ path: "league" }, { path: "tierList" }],
  });
};

LeagueDivisionSchema.methods.includesTeamId = function (
  teamId: Types.ObjectId | string,
) {
  const target = teamId.toString();
  return this.teams.some((team) => {
    const value =
      typeof team === "object" && team !== null && "_id" in team
        ? (team as LeagueTeamDocument)._id
        : (team as Types.ObjectId);
    return value.toString() === target;
  });
};

LeagueDivisionSchema.methods.firstMatchingTeamId = function (
  teamIds: (Types.ObjectId | string)[],
) {
  const teamIdSet = new Set(teamIds.map((id) => id.toString()));
  for (const divisionTeam of this.teams) {
    const divisionTeamId = (
      typeof divisionTeam === "object" &&
      divisionTeam !== null &&
      "_id" in divisionTeam
        ? (divisionTeam as LeagueTeamDocument)._id
        : (divisionTeam as Types.ObjectId)
    ).toString();
    if (teamIdSet.has(divisionTeamId)) {
      return typeof divisionTeam === "object" &&
        divisionTeam !== null &&
        "_id" in divisionTeam
        ? (divisionTeam as LeagueTeamDocument)._id
        : (divisionTeam as Types.ObjectId);
    }
  }
  return undefined;
};

LeagueDivisionSchema.statics.findPublicByTeamIds = function (
  teamIds: (Types.ObjectId | string)[],
) {
  return this.find({ teams: { $in: teamIds }, public: true }).sort({
    createdAt: -1,
  });
};

LeagueDivisionSchema.statics.findPublicByTeamIdsWithTournament =
  async function (teamIds: (Types.ObjectId | string)[]) {
    return this.find({ teams: { $in: teamIds }, public: true })
      .sort({ createdAt: -1 })
      .populate({
        path: "tournament",
        populate: [{ path: "league" }, { path: "tierList" }],
      });
  };

export default model<LeagueDivision, LeagueDivisionModel>(
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionSchema,
);
