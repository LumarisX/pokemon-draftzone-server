import { Document, Model, model, Schema, Types } from "mongoose";
import {
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_MATCHUP_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
} from ".";
import { LeagueDivisionDocument, LeagueStageDocument } from "./division.model";
import { LeagueTeamDocument } from "./team.model";

export type PokemonStats = {
  kills?: number;
  indirect?: number;
  deaths?: number;
  brought?: number;
};

export type MatchTeam = {
  score?: number;
  pokemon: Map<string, PokemonStats>;
};

export type MatchResult = {
  replay?: string;
  winner: "team1" | "team2";
  team1: MatchTeam;
  team2: MatchTeam;
};

export type LeagueMatchupData = {
  stage: LeagueStageDocument | Types.ObjectId;
  division: LeagueDivisionDocument | Types.ObjectId;
  team1: LeagueTeamDocument | Types.ObjectId;
  team2: LeagueTeamDocument | Types.ObjectId;
  results: MatchResult[];
  notes?: string;
  scheduledDate?: Date;
  score?: {
    team1: number;
    team2: number;
  };
  winner?: "team1" | "team2";
};

export type LeagueMatchupDocument = Document<Types.ObjectId> &
  LeagueMatchupData &
  MatchupMethods &
  MatchupVirtuals;

type MatchupMethods = {
  // getScore(team: "team1" | "team2"): number;
};

type MatchupVirtuals = {
  // winner?: "team1" | "team2";
};

type LeagueMatchupModel = Model<LeagueMatchupDocument, {}, MatchupMethods>;

const pokemonStatsSchema = new Schema(
  {
    kills: { type: Number },
    indirect: { type: Number },
    deaths: { type: Number },
    brought: { type: Number },
  },
  { _id: false },
);

export const leagueMatchupSchema: Schema<
  LeagueMatchupDocument,
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
    team1: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    team2: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    results: [
      {
        replay: { type: String },
        winner: {
          type: String,
          enum: ["team1", "team2"],
          required: true,
        },
        team1: {
          score: { type: Number, required: true },
          pokemon: {
            type: Map,
            of: pokemonStatsSchema,
          },
        },
        team2: {
          score: { type: Number, required: true },
          pokemon: {
            type: Map,
            of: pokemonStatsSchema,
          },
        },
      },
    ],
    notes: { type: String },
    scheduledDate: { type: Date },
    score: {
      type: {
        team1: { type: Number, required: true },
        team2: { type: Number, required: true },
      },
    },
    winner: { type: String, enum: ["team1", "team2"] },
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

export const LeagueMatchupModel = model<
  LeagueMatchupDocument,
  LeagueMatchupModel
>(LEAGUE_MATCHUP_COLLECTION, leagueMatchupSchema);
