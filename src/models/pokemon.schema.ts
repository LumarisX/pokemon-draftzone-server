import mongoose from "mongoose";

const captSchema = new mongoose.Schema(
  {
    tera: {
      type: [String],
    },
  },
  { _id: false }
);

export const pokemonSchema = new mongoose.Schema(
  {
    pid: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    shiny: Boolean,
    capt: {
      type: captSchema,
    },
  },
  { _id: false }
);