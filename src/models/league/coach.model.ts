import mongoose, { Schema, Document, Types } from "mongoose";
import z from "zod";
import { LEAGUE_COACH_COLLECTION } from ".";

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Invalid name: Must be a non-empty string."),
    gameName: z
      .string()
      .trim()
      .min(1, "Invalid gameName: Must be a non-empty string."),
    discordName: z
      .string()
      .trim()
      .min(1, "Invalid discordName: Must be a non-empty string."),
    teamName: z
      .string()
      .trim()
      .min(1, "Invalid teamName: Must be a non-empty string."),
    timezone: z
      .string()
      .trim()
      .min(1, "Invalid timezone: Must be a non-empty string."),
    experience: z.string({
      required_error: "Invalid experience: Must be a string.",
      invalid_type_error: "Invalid experience: Must be a string.",
    }),
    droppedBefore: z.boolean({
      required_error: "Invalid droppedBefore: Must be a boolean.",
      invalid_type_error: "Invalid droppedBefore: Must be a boolean.",
    }),
    droppedWhy: z.string({
      required_error:
        "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
      invalid_type_error:
        "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
    }),
    confirm: z.boolean({
      required_error: "Invalid confirm: Must be true.",
      invalid_type_error: "Invalid confirm: Must be true.",
    }),
  })
  .superRefine((value, ctx) => {
    if (value.droppedBefore && value.droppedWhy.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["droppedWhy"],
        message:
          "Invalid droppedWhy: Must be a non-empty string if droppedBefore is true.",
      });
    }
    if (!value.confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm"],
        message: "Invalid confirm: Must be true.",
      });
    }
  });

export type LeagueCoach = {
  auth0Id: string;
  timezone: string;
  name: string;
  discordName: string;
  gameName: string;
  tournamentId: Types.ObjectId;
  teamName: string;
  logo?: string;
  experience: string;
  droppedBefore: boolean;
  droppedWhy?: string;
  confirmed: boolean;
  status: "approved" | "pending" | "denied";
  signedUpAt: Date;
};

export type LeagueCoachDocument = Document &
  LeagueCoach & { _id: Types.ObjectId };

const LeagueCoachSchema: Schema<LeagueCoachDocument> = new Schema(
  {
    auth0Id: { type: String, required: true },
    timezone: { type: String, required: true },
    name: { type: String, required: true },
    discordName: { type: String, required: true },
    gameName: { type: String, required: true },
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    teamName: { type: String, required: true },
    logo: { type: String, index: true },
    experience: { type: String, required: true },
    droppedBefore: { type: Boolean, required: true, default: false },
    droppedWhy: { type: String },
    confirmed: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      enum: ["approved", "pending", "denied"],
      default: "pending",
    },
    signedUpAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export default mongoose.model<LeagueCoachDocument>(
  LEAGUE_COACH_COLLECTION,
  LeagueCoachSchema,
);
