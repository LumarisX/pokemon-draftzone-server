import { Document, model, Schema, Types } from "mongoose";
import {
  LEAGUE_STAGE_COLLECTION,
  LEAGUE_TEAM_COLLECTION,
  LEAGUE_MATCHUP_COLLECTION,
} from ".";

export type MatchResult = {
  replay: string;
  winner: "team1" | "team2";
  team1: {
    score: number;
    pokemon: {
      id: string;
      name: string;
      stats?: {
        kills?: number;
        indirect?: number;
        deaths?: number;
        brought?: number;
      };
    }[];
  };
  team2: {
    score: number;
    pokemon: {
      id: string;
      name: string;
      stats?: {
        kills?: number;
        indirect?: number;
        deaths?: number;
        brought?: number;
      };
    }[];
  };
};

export type LeagueMatchupData = {
  stageId: Types.ObjectId;
  team1Id: Types.ObjectId;
  team2Id: Types.ObjectId;
  results: MatchResult[];
  notes?: string;
  scheduledDate?: Date;
  scoreOverride?: {
    team1score: number;
    team2score: number;
    winner: "team1" | "team2";
  };
};

export type LeagueMatchupDocument = Document<Types.ObjectId> &
  LeagueMatchupData &
  MatchupMethods &
  MatchupVirtuals;

type MatchupMethods = {
  getScore(team: "team1" | "team2"): number;
};

type MatchupVirtuals = {
  winner?: "team1" | "team2";
};

export const leagueMatchupSchema = new Schema<LeagueMatchupData>(
  {
    stageId: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_STAGE_COLLECTION,
      required: true,
      index: true,
    },
    team1Id: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    team2Id: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TEAM_COLLECTION,
      required: true,
    },
    results: [
      {
        replay: { type: String, required: true },
        winner: { type: String, enum: ["team1", "team2"], required: true },
        team1: {
          score: { type: Number },
          pokemon: [
            {
              id: { type: String, required: true },
              name: { type: String, required: true },
              stats: {
                kills: { type: Number },
                indirect: { type: Number },
                deaths: { type: Number },
                brought: { type: Number },
              },
            },
          ],
        },
        team2: {
          score: { type: Number },
          pokemon: [
            {
              id: { type: String, required: true },
              name: { type: String, required: true },
              stats: {
                kills: { type: Number },
                indirect: { type: Number },
                deaths: { type: Number },
                brought: { type: Number },
              },
            },
          ],
        },
      },
    ],
    notes: { type: String },
    scheduledDate: { type: Date },
    scoreOverride: {
      type: {
        team1score: { type: Number, required: true },
        team2score: { type: Number, required: true },
        winner: { type: String, enum: ["team1", "team2"], required: true },
      },
    },
  },
  { timestamps: true },
);

function getResultScore(team: {
  score?: number;
  pokemon: { stats?: { brought?: number; deaths?: number } }[];
}): number {
  if (team.score !== undefined) {
    return team.score;
  }

  return team.pokemon.reduce((sum, pokemon) => {
    const deaths = pokemon.stats?.deaths ?? 0;
    if (deaths < 1) {
      return sum + (pokemon.stats?.brought ?? 0);
    }
    return sum;
  }, 0);
}

leagueMatchupSchema.method(
  "getScore",
  function (this: LeagueMatchupData, team: "team1" | "team2") {
    if (this.scoreOverride) {
      return team === "team1"
        ? this.scoreOverride.team1score
        : this.scoreOverride.team2score;
    }

    if (!this.results || this.results.length === 0) {
      return 0;
    }

    if (this.results.length === 1) {
      const result = this.results[0];
      return team === "team1"
        ? getResultScore(result.team1)
        : getResultScore(result.team2);
    }

    return this.results.reduce((wins, result) => {
      if (team === "team1" && result.winner === "team1") {
        return wins + 1;
      }
      if (team === "team2" && result.winner === "team2") {
        return wins + 1;
      }
      return wins;
    }, 0);
  },
);

leagueMatchupSchema.virtual("winner").get(function (
  this: LeagueMatchupDocument,
) {
  if (this.scoreOverride) {
    return this.scoreOverride.winner;
  }

  const team1Score = this.getScore("team1");
  const team2Score = this.getScore("team2");

  if (team1Score > team2Score) {
    return "team1";
  }

  if (team2Score > team1Score) {
    return "team2";
  }

  return undefined;
});

export const LeagueMatchupModel = model<LeagueMatchupData>(
  LEAGUE_MATCHUP_COLLECTION,
  leagueMatchupSchema,
);
