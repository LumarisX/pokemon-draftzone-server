import { ID, TypeName } from "@pkmn/data";
import mongoose from "mongoose";
import { Pokemon } from "../classes/pokemon";

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

export const pokemonSchema = new mongoose.Schema<PokemonData>(
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
      default: undefined,
    },
  },
  { _id: false }
);

export type PokemonData = Omit<Pokemon, "name">;
