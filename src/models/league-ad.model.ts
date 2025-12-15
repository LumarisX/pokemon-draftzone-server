import mongoose, { Document, Types } from "mongoose";

const leagueAdSchema = new mongoose.Schema(
  {
    leagueName: {
      type: String,
      required: true,
      trim: true,
    },
    owner: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    leagueDoc: {
      type: String,
      trim: true,
      default: "",
    },
    serverLink: {
      type: String,
      trim: true,
      default: "",
    },
    skillLevelRange: {
      type: {
        from: { type: String, required: true },
        to: { type: String, required: true },
      },
      required: true,
    },
    prizeValue: {
      type: String,
      required: true,
      enum: ["0", "1", "2", "3", "4"],
    },
    platforms: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length >= 1,
        message: "At least one platform is required",
      },
    },
    formats: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length >= 1,
        message: "At least one format is required",
      },
    },
    rulesets: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length >= 1,
        message: "At least one ruleset is required",
      },
    },
    signupLink: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Approved", "Denied", "Pending"],
      default: "Approved",
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
  },
  {
    timestamps: true,
  }
);

export type LeagueAdData = {
  leagueName: string;
  owner: string;
  description: string;
  leagueDoc?: string;
  serverLink?: string;
  skillLevelRange: {
    from: string;
    to: string;
  };
  prizeValue: "0" | "1" | "2" | "3" | "4";
  platforms: string[];
  formats: string[];
  rulesets: string[];
  signupLink: string;
  status: "Approved" | "Denied" | "Pending";
  closesAt: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export interface LeagueAdDocument
  extends LeagueAdData,
    Document<Types.ObjectId> {}

export const LeagueAdModel = mongoose.model<LeagueAdDocument>(
  "leaguead",
  leagueAdSchema
);
