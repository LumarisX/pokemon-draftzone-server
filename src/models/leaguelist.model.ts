import mongoose, { Document, InferSchemaType, Types } from "mongoose";

const divisionSchema = new mongoose.Schema(
  {
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
      max: 4,
      required: true,
    },
    platform: {
      type: String,
      enum: ["Pokémon Showdown", "Scarlet/Violet"],
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
    description: {
      type: String,
      trim: true,
    },
  },
  { id: false }
);

export type DivisionDocType = InferSchemaType<typeof divisionSchema>;

const leagueAdSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true,
    trim: true,
  },
  owner: {
    type: Types.ObjectId,
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
    type: [divisionSchema],
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

export type LeagueAdData = {
  description: string;
  leagueName: string;
  owner: string;
  recruitmentStatus: "Open" | "Closed" | "Full" | "Canceled";
  hostLink?: string;
  signupLink: string;
  status?: "Approved" | "Denied" | "Pending";
  closesAt: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
  divisions: {
    divisionName: string;
    skillLevelRange: {
      from: string;
      to: string;
    };
    prizeValue: number;
    platform: "Pokémon Showdown" | "Scarlet/Violet";
    format: string;
    ruleset: string;
    description?: string;
  }[];
};

export interface LeagueAdDocument
  extends LeagueAdData,
    Document<Types.ObjectId> {}

export const LeagueAdModel = mongoose.model<LeagueAdDocument>(
  "leaguead",
  leagueAdSchema
);
