import { ID, TypeName } from "@pkmn/data";
import mongoose from "mongoose";

const captSchema = new mongoose.Schema(
  {
    tera: {
      type: [String],
      default: undefined,
    },
    z: {
      type: [String],
      default: undefined,
    },
    dmax: {
      type: Boolean,
      default: undefined,
    },
  },
  { _id: false }
);

const modifiersSchema = new mongoose.Schema(
  {
    moves: {
      type: [String],
      default: undefined,
    },
    abilities: {
      type: [String],
      default: undefined,
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
      default: undefined,
    },
    capt: {
      type: captSchema,
    },
    modifiers: {
      type: modifiersSchema,
    },
    nickname: {
      type: String,
      default: undefined,
    },
    draftFormes: {
      type: [String],
    },
  },
  { _id: false }
);

export interface PokemonData {
  id: ID;
  shiny?: boolean;
  nickname?: string;
  draftFormes?: ID[];
  modifiers?: {
    moves?: string[];
    abilities?: string[];
  };
  capt?: {
    tera?: TypeName[];
    z?: TypeName[];
    dmax?: boolean;
  };
}
