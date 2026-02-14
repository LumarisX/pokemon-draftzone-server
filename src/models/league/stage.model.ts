import { Document, model, Schema, Types } from "mongoose";
import {
  LEAGUE_TOURNAMENT_COLLECTION,
  LEAGUE_DIVISION_COLLECTION,
  LEAGUE_STAGE_COLLECTION,
} from ".";

export type LeagueStageData = {
  tournamentId: Types.ObjectId;
  divisionIds: Types.ObjectId[];
  name: string;
};

export type LeagueStageDocument = Document<Types.ObjectId> & LeagueStageData;

export const leagueStageSchema = new Schema<LeagueStageData>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TOURNAMENT_COLLECTION,
      required: true,
    },
    divisionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: LEAGUE_DIVISION_COLLECTION,
        required: true,
      },
    ],
    name: { type: String, required: true },
  },
  { timestamps: true },
);

export const LeagueStageModel = model<LeagueStageData>(
  LEAGUE_STAGE_COLLECTION,
  leagueStageSchema,
);
