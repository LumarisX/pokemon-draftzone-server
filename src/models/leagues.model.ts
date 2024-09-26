import mongoose from "mongoose";

const leagueAdSchema = new mongoose.Schema({
  leagueName: {
    type: String,
    required: true,
    trim: true,
  },
  organizer: {
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
  hostPlatform: {
    type: String,
    enum: ["Discord", "Battlefy"],
    required: true,
  },
  serverLink: {
    type: String,
    trim: true,
  },
  divisions: {
    type: [
      {
        divisionName: {
          type: String,
          required: true,
          trim: true,
        },
        skillLevelRange: {
          from: { type: Number, min: 0, max: 3 },
          to: { type: Number, min: 0, max: 3 },
          // validate: {
          //   validator: function (to: number, from: number) {
          //     return to >= from;
          //   },
          //   message:
          //     'Skill level range "to" should be greater than or equal to "from".',
          // },
        },
        cashValue: {
          type: Number,
          min: 0,
          max: 3,
        },
        platform: {
          type: String,
          enum: ["Pokémon Showdown", "Scarlet/Violet"],
          required: true,
        },
        format: {
          type: String,
          enum: ["Singles", "VGC", "Other"],
          required: true,
        },
        description: {
          type: String,
          trim: true,
        },
      },
    ],
    // validate: {
    //   validator: function (v: any) {
    //     return Array.isArray(v) && v.length > 0;
    //   },
    //   message: "There must be at least one division.",
    // },
  },
  signupLink: {
    type: String,
    required: true,
    trim: true,
  },
  closesAt: {
    type: Date,
    required: true,
  },
  seasonStart: {
    type: Date,
    required: true,
  },
  seasonEnd: {
    type: Date,
    required: true,
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

export const LeagueAdModel = mongoose.model("leaguead", leagueAdSchema);
