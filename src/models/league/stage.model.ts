import { Document, model, Schema, Types } from "mongoose";
import { LEAGUE_DIVISION_COLLECTION, LEAGUE_STAGE_COLLECTION } from ".";
import { LeagueDivisionDocument } from "./division.model";

export type LeagueStageData = {
  division: LeagueDivisionDocument | Types.ObjectId;
  name: string;
};

export type LeagueStageDocument = Document<Types.ObjectId> & LeagueStageData;

export const leagueStageSchema = new Schema<LeagueStageData>(
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

export const LeagueStageModel = model<LeagueStageData>(
  LEAGUE_STAGE_COLLECTION,
  leagueStageSchema,
);
