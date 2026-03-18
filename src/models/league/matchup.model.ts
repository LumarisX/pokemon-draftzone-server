import { HydratedDocument, Model, model, Schema, Types } from "mongoose";
import {
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_MATCHUP_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
} from ".";
import { LeagueDivisionDocument } from "./division.model";

const MATCH_SIDES = ["side1", "side2"] as const;
const MATCH_WINNERS = [...MATCH_SIDES, "draw"] as const;
const MATCH_STATUSES = ["pending", "approved"] as const;
const POKEMON_STATUSES = ["brought", "survived", "fainted"] as const;

type MatchWinner = (typeof MATCH_WINNERS)[number];
type MatchupStatus = (typeof MATCH_STATUSES)[number];
type PokemonStatus = (typeof POKEMON_STATUSES)[number];

export type PokemonStatsOld = {
  kills?: number;
  indirect?: number;
  deaths?: number;
  brought?: number;
};

export type PokemonStats = {
  kills?: {
    direct?: number;
    indirect?: number;
    teammate?: number;
  };
  status: PokemonStatus;
};

export type MatchTeam = {
  score?: number;
  pokemon: Map<string, PokemonStats>;
};

export type MatchResult = {
  replay?: string;
  winner: MatchWinner;
  side1: MatchTeam;
  side2: MatchTeam;
};

export type MatchSide = {
  team: Types.ObjectId;
  notes?: string;
  score?: number;
};

export type LeagueMatchupData = {
  stage: Types.ObjectId;
  division: LeagueDivisionDocument | Types.ObjectId;
  side1: MatchSide;
  side2: MatchSide;
  results: MatchResult[];
  notes?: string;
  scheduledDate?: Date;
  winner?: MatchWinner;
  forfeit?: boolean;
  status?: MatchupStatus;
};

export type LeagueMatchupDocument = HydratedDocument<
  LeagueMatchupData,
  MatchupMethods & MatchupVirtuals
>;

type MatchupMethods = {
  // getScore(team: "team1" | "team2"): number;
};

type MatchupVirtuals = {
  // winner?: "team1" | "team2";
};

type LeagueMatchupModel = Model<
  LeagueMatchupData,
  {},
  MatchupMethods,
  MatchupVirtuals,
  LeagueMatchupDocument
>;

const killsSchema = new Schema(
  {
    direct: { type: Number, min: 0 },
    indirect: { type: Number, min: 0 },
    teammate: { type: Number, min: 0 },
  },
  { _id: false },
);

const pokemonStatsSchema = new Schema<PokemonStats>(
  {
    kills: { type: killsSchema },
    status: {
      type: String,
      enum: POKEMON_STATUSES,
      required: true,
    },
  },
  { _id: false },
);

export const leagueMatchupSideSchema = new Schema<MatchSide>(
  {
    team: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    notes: { type: String, trim: true },
    score: { type: Number, min: 0 },
  },
  { _id: false },
);

export const leagueMatchupSchema: Schema<
  LeagueMatchupData,
  LeagueMatchupModel,
  MatchupMethods,
  {},
  MatchupVirtuals
> = new Schema(
  {
    stage: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    division: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_DIVISION_COLLECTION,
      required: true,
    },
    side1: {
      type: leagueMatchupSideSchema,
      required: true,
    },
    side2: {
      type: leagueMatchupSideSchema,
      required: true,
    },
    results: {
      type: [
        {
          _id: false,
          replay: { type: String, trim: true },
          winner: {
            type: String,
            enum: MATCH_WINNERS,
            required: true,
          },
          side1: {
            score: { type: Number, required: true, min: 0 },
            pokemon: {
              type: Map,
              of: pokemonStatsSchema,
              default: {},
            },
          },
          side2: {
            score: { type: Number, required: true, min: 0 },
            pokemon: {
              type: Map,
              of: pokemonStatsSchema,
              default: {},
            },
          },
        },
      ],
      default: [],
    },
    notes: { type: String, trim: true },
    scheduledDate: { type: Date },
    winner: {
      type: String,
      enum: MATCH_WINNERS,
    },
    forfeit: { type: Boolean },
    status: { type: String, enum: MATCH_STATUSES },
  },
  { timestamps: true },
);

// leagueMatchupSchema.method(
//   "getScore",
//   function (this: LeagueMatchupData, team: "team1" | "team2") {
//     if (this.score)
//       return team === "team1" ? this.score.team1 : this.score.team2;
//     if (!this.results || this.results.length === 0) return 0;
//     if (this.results.length === 1) {
//       const result = this.results[0];
//       return team === "team1"
//         ? getResultScore(result.team1)
//         : getResultScore(result.team2);
//     }

//     return this.results.reduce((wins, result) => {
//       if (team === "team1" && result.winner === "team1") return wins + 1;
//       if (team === "team2" && result.winner === "team2") return wins + 1;
//       return wins;
//     }, 0);
//   },
// );

// leagueMatchupSchema.virtual("winner").get(function (
//   this: LeagueMatchupDocument,
// ) {
//   if (this.score) return this.winner;
//   const team1Score = this.getScore("team1");
//   const team2Score = this.getScore("team2");
//   if (team1Score > team2Score) return "team1";
//   if (team2Score > team1Score) return "team2";

//   return undefined;
// });

export const LeagueMatchupModel = model<LeagueMatchupData, LeagueMatchupModel>(
  LEAGUE_MATCHUP_COLLECTION,
  leagueMatchupSchema,
);
