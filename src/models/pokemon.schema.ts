import { ID } from "@pkmn/data";
import mongoose from "mongoose";

const captSchema = new mongoose.Schema(
  {
    tera: {
      type: [String],
    },
    z: {
      type: Boolean,
    },
  },
  { _id: false }
);

export const pokemonSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    shiny: {
      type: Boolean,
    },
    capt: {
      type: captSchema,
    },
  },
  { _id: false }
);

export interface PokemonData {
  id: ID;
  shiny?: boolean;
  capt?: {
    tera?: string[];
    z?: boolean;
  };
}
