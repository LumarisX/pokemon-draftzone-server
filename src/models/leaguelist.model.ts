import mongoose, { InferSchemaType, ObjectId } from "mongoose";
import { getFormats } from "../data/formats";
import { getRulesets } from "../data/rulesets";

const divisionSchema = new mongoose.Schema({
  divisionName: {
    type: String,
    required: true,
    trim: true,
  },
  skillLevelRange: {
    type: {
      from: { type: String, required: true },
      to: { type: String, required: true },
    },
    required: true,
  },
  prizeValue: {
    type: Number,
    min: 0,
    max: 3,
    required: true,
  },
  platform: {
    type: String,
    enum: ["Pokémon Showdown", "Scarlet/Violet"],
    required: true,
  },
  format: {
    type: String,
    enum: [...getFormats(), "Other"],
    required: true,
  },
  ruleset: {
    type: String,
    enum: [...getRulesets(), "Other"],
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
});

export type DivisionDocType = InferSchemaType<typeof divisionSchema>;

const leagueAdSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true,
    trim: true,
  },
  owner: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  recruitmentStatus: {
    type: String,
    enum: ["Open", "Closed", "Full", "Canceled"],
    default: "Open",
    required: true,
  },
  hostLink: {
    type: String,
    trim: true,
  },
  divisions: {
    type: [divisionSchema, { _id: false }],
  },
  signupLink: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ["Approved", "Denied", "Pending"],
    default: "Pending",
    required: true,
  },
  closesAt: {
    type: Date,
    required: true,
  },
  seasonStart: {
    type: Date,
  },
  seasonEnd: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export type LeagueAdDoc = Omit<
  InferSchemaType<typeof leagueAdSchema>,
  "divisions"
> & {
  _id?: mongoose.Types.ObjectId;
  divisions: DivisionDocType[];
};
export const LeagueAdModel = mongoose.model("leaguead", leagueAdSchema);
