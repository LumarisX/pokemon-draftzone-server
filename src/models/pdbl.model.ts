import mongoose, { InferSchemaType } from "mongoose";

const pdblSchema = new mongoose.Schema({
  name: { type: String, required: true },
  timezone: { type: String, required: true },
  experience: { type: String, required: true },
  dropped: { type: String },
  confirm: { type: Boolean, required: true },
  sub: { type: String, required: true },
});

export type PDBLDoc = InferSchemaType<typeof pdblSchema> & {
  _id?: mongoose.Types.ObjectId;
};
export const PDBLModel = mongoose.model("pdbl2", pdblSchema);
