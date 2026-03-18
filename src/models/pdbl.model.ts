import { InferSchemaType, model, Schema, Types } from "mongoose";

const pdblSchema = new Schema({
  name: { type: String, required: true },
  timezone: { type: String, required: true },
  experience: { type: String, required: true },
  dropped: { type: String },
  confirm: { type: Boolean, required: true },
  sub: { type: String, required: true },
});

export type PDBLDoc = InferSchemaType<typeof pdblSchema> & {
  _id?: Types.ObjectId;
};
export const PDBLModel = model("pdbl2", pdblSchema);
