import mongoose from "mongoose";

const supporterSchema = new mongoose.Schema({
  username: { type: String, required: true },
  startDate: { type: Date, required: true, default: Date.now() },
  tier: { type: String, required: true },
  enabled: { type: Boolean, required: true },
  extraMonths: { type: Number, default: 0 },
  endDate: { type: Date },
  email: { type: String },
});

interface Supporter {
  username: string;
  startDate: Date;
  tier: string;
  enabled: boolean;
  extraMonths?: number;
  endDate?: Date;
  email?: string;
}

export interface SupporterDocument extends Supporter, Document {
  updatedAt: Date;
  createdAt: Date;
}
export const SupporterModel = mongoose.model<SupporterDocument>(
  "supporters",
  supporterSchema
);
