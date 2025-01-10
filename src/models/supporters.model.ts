import mongoose from "mongoose";

const supporterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true, default: Date.now() },
  tier: { type: String },
  enabled: { type: Boolean, required: true },
  extraMonths: { type: Number, default: 0 },
  amount: { type: Number },
  endDate: { type: Date },
  email: { type: String },
});

export interface Supporter {
  name: string;
  startDate: Date;
  tier?: string;
  enabled: boolean;
  extraMonths?: number;
  amount?: number;
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
