import { Document, model, Schema, Types } from "mongoose";
import { LEAGUE_DIVISION_COLLECTION } from "./division.model";
import { LEAGUE_TOURNAMENT_COLLECTION } from "./tournament.model";

export const LEAGUE_STAGE_COLLECTION = "LeagueStage";

export type LeagueStageData = {
  leagueId: Types.ObjectId;
  divisionIds: Types.ObjectId[];
  name: string;
};

export type LeagueStageDocument = Document<Types.ObjectId> & LeagueStageData;

export const leagueStageSchema = new Schema<LeagueStageData>(
  {
    leagueId: {
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
