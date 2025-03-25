import { Document, model, Schema, Types } from "mongoose";
import { FormatId } from "../data/formats";
import { RulesetId } from "../data/rulesets";
import { PokemonData, pokemonSchema } from "./pokemon.schema";

const draftSchema = new Schema<DraftData>(
  {
    leagueName: {
      type: String,
      required: true,
    },
    teamName: {
      type: String,
    },
    leagueId: {
      type: String,
      required: true,
    },
    format: {
      type: String,
      required: true,
    },
    ruleset: {
      type: String,
      required: true,
    },
    owner: {
      type: String,
      required: true,
      ref: "users",
    },
    doc: {
      type: String,
      default: undefined,
    },
    team: {
      type: [pokemonSchema],
      required: true,
    },
    score: {
      wins: { type: Number, required: true, default: 0 },
      loses: { type: Number, required: true, default: 0 },
      diff: { type: String, required: true, default: "0" },
    },
  },
  { timestamps: true }
);

export type DraftData = {
  leagueName: string;
  teamName: string;
  leagueId: string;
  format: FormatId;
  ruleset: RulesetId;
  doc?: string;
  score: {
    wins: number;
    loses: number;
    diff: string;
  };
  owner: string;
  team: PokemonData[];
};

export type DraftDocument = DraftData & Document<Types.ObjectId>;

draftSchema.index({ owner: 1, leagueId: 1 }, { unique: true });

export const DraftModel = model<DraftData>("draft", draftSchema);
