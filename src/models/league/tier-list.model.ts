import mongoose, { Schema, Types, Document } from "mongoose";
import { LeagueCoachDocument } from "./coach.model";
import { LEAGUE_COACH_COLLECTION, LEAGUE_TIER_LIST_COLLECTION } from ".";

export type TierListPokemonAddon = {
  name: string;
  cost: number;
  notes?: string;
};

export type LeagueTierListPokemon = {
  name: string;
  tier: string;
  notes?: string;
  addons?: TierListPokemonAddon[];
};

export type LeagueTier = {
  name: string;
  cost: number;
  color?: string;
};

export type DraftCount = {
  min: number;
  max: number;
};

export type LeagueTierList = {
  name: string;
  description?: string;
  createdBy: Types.ObjectId | LeagueCoachDocument;
  pokemon: Map<string, LeagueTierListPokemon>;
  tiers: LeagueTier[];
  bannedMoves: string[];
  bannedAbilities: string[];
  pointTotal: number;
  draftCount: DraftCount;
  format: string;
  ruleset: string;
};

export type LeagueTierListDocument = Document &
  LeagueTierList & {
    _id: Types.ObjectId;
    getPokemonCost(pokemonId: string, addonName?: string[]): number | undefined;
    getTierByName(tierName: string): LeagueTier | undefined;
    getPokemonIds(): string[];
  };

const TierListPokemonAddonSchema: Schema<TierListPokemonAddon> = new Schema(
  {
    name: { type: String, required: true },
    cost: { type: Number, required: true },
    notes: { type: String },
  },
  { _id: false },
);

export const LeagueTierListPokemonSchema: Schema<LeagueTierListPokemon> =
  new Schema(
    {
      name: { type: String, required: true },
      tier: { type: String, required: true },
      notes: { type: String },
      addons: [TierListPokemonAddonSchema],
    },
    { _id: false },
  );

export const LeagueTierSchema: Schema<LeagueTier> = new Schema(
  {
    name: { type: String, required: true },
    cost: { type: Number, required: true },
  },
  { _id: false },
);

const LeagueTierListSchema: Schema<LeagueTierListDocument> = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COACH_COLLECTION,
      required: true,
    },
    pokemon: {
      type: Map,
      of: LeagueTierListPokemonSchema,
      default: {},
    },
    tiers: [LeagueTierSchema],
    bannedMoves: [{ type: String }],
    bannedAbilities: [{ type: String }],
    pointTotal: { type: Number },
    draftCount: {
      type: {
        min: { type: Number, required: true },
        max: { type: Number, required: true },
      },
      required: true,
    },
    format: { type: String, required: true },
    ruleset: { type: String, required: true },
  },
  { timestamps: true },
);

LeagueTierListSchema.methods.getPokemonCost = function (
  pokemonId: string,
  addons?: string[],
): number | undefined {
  const pokemon = (this.pokemon as Map<string, LeagueTierListPokemon>).get(
    pokemonId,
  );

  if (!pokemon) return undefined;

  if (addons && addons.length && pokemon.addons) {
    const addon = pokemon.addons.find((a) => a.name === addons[0]);
    if (addon) return addon.cost;
  }

  const tier = this.tiers.find((t: LeagueTier) => t.name === pokemon.tier);
  return tier ? tier.cost : undefined;
};

LeagueTierListSchema.methods.getTierByName = function (
  tierName: string,
): LeagueTier | undefined {
  return this.tiers.find((t: LeagueTier) => t.name === tierName);
};

LeagueTierListSchema.methods.getPokemonIds = function (): string[] {
  return Array.from(
    (this.pokemon as Map<string, LeagueTierListPokemon>).keys(),
  );
};

export default mongoose.model<LeagueTierListDocument>(
  LEAGUE_TIER_LIST_COLLECTION,
  LeagueTierListSchema,
);
