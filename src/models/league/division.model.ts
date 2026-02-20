import {
  model,
  Schema,
  Types,
  Document,
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

export type LeagueDivision = {
  divisionKey: string;
  name: string;
  teams: (Types.ObjectId | LeagueTeamDocument)[];
  skipTime?: Date;
  channelId?: string;
  timerLength: number;
  skipTimerPenalty: number;
  remainingTime?: number;
  draftStyle: "snake" | "linear";
  draftCounter: number;
  status: "PRE_DRAFT" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  public: boolean;
  eventLog: DraftEventLog[];
  tournament: Types.ObjectId | LeagueTournamentDocument;
  useRandomDraftOrder?: boolean;
  trades: DraftTrade[];
};

type TradeSide = {
  team?: Types.ObjectId | LeagueTeamDocument;
  pokemon: string;
};

export type DraftTrade = {
  side1: TradeSide;
  side2: TradeSide;
  timestamp: Date;
};

const TradeSideSchema = new Schema<TradeSide>(
  {
    team: { type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION },
    pokemon: { type: String, required: true },
  },
  { _id: false },
);

const TradeSchema: Schema<DraftTrade> = new Schema(
  {
    side1: { type: TradeSideSchema, required: true },
    side2: { type: TradeSideSchema, required: true },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

export type LeagueDivisionDocument = Document &
  LeagueDivision &
  DivisionMethods & { _id: Types.ObjectId };

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
  LeagueDivisionDocument,
  DivisionQueryHelpers
> & {
  findPublicByTeamIds(
    teamIds: (Types.ObjectId | string)[],
  ): QueryWithHelpers<any, LeagueDivisionDocument, DivisionQueryHelpers>;
  findPublicByTeamIdsWithTournament(
    teamIds: (Types.ObjectId | string)[],
  ): Promise<LeagueDivisionDocument[]>;
};

const LeagueDivisionSchema: Schema<
  LeagueDivisionDocument,
  LeagueDivisionModel,
  DivisionMethods,
  DivisionQueryHelpers
> = new Schema(
  {
    divisionKey: { type: String, required: true },
    name: { type: String, required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: LEAGUE_TEAM_COLLECTION }],
    skipTime: { type: Date },
    channelId: { type: String },
    timerLength: { type: Number },
    skipTimerPenalty: { type: Number, default: 30 },
    remainingTime: { type: Number },
    draftStyle: { type: String, enum: ["snake", "linear"], default: "snake" },
    public: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["PRE_DRAFT", "IN_PROGRESS", "PAUSED", "COMPLETED"],
      default: "PRE_DRAFT",
    },

    draftCounter: { type: Number, default: 0 },
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
    tournament: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TOURNAMENT_COLLECTION,
      required: true,
    },
    useRandomDraftOrder: { type: Boolean, default: true },
    trades: { type: [TradeSchema], default: [] },
  },
  { timestamps: true },
);

LeagueDivisionSchema.index({ tournament: 1, divisionKey: 1 }, { unique: true });

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
  return this.find().withTeamIds(teamIds).isPublic().sort({ createdAt: -1 });
};

LeagueDivisionSchema.statics.findPublicByTeamIdsWithTournament =
  async function (teamIds: (Types.ObjectId | string)[]) {
    return this.findPublicByTeamIds(teamIds).withTournamentLeagueTierList();
  };

export default model<LeagueDivisionDocument, LeagueDivisionModel>(
  LEAGUE_DIVISION_COLLECTION,
  LeagueDivisionSchema,
);
