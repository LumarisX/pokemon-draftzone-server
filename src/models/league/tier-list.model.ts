import { HydratedDocument, model, Model, Schema, Types } from "mongoose";
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
  banned?: boolean;
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

export type TierListSettings = {
  isPublic: boolean;
  shareToken?: string;
};

export type LeagueTierList = {
  name: string;
  description?: string;
  createdBy: Types.ObjectId | LeagueCoachDocument;
  copiedFrom?: Types.ObjectId;
  pokemon: Map<string, LeagueTierListPokemon>;
  tiers: LeagueTier[];
  banned: {
    moves: string[];
    abilities: string[];
  };
  pointTotal: number;
  draftCount: DraftCount;
  format: string;
  ruleset: string;
  settings: TierListSettings;
  collaborators: Types.ObjectId[];
};

type TierListMethods = {
  getPokemonCost(pokemonId: string, addonName?: string[]): number | undefined;
  getTierByName(tierName: string): LeagueTier | undefined;
  getPokemonIds(): string[];
};

export type LeagueTierListDocument = HydratedDocument<
  LeagueTierList,
  TierListMethods
>;

type LeagueTierListModel = Model<
  LeagueTierList,
  {},
  TierListMethods,
  {},
  LeagueTierListDocument
>;

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
      banned: { type: Boolean },
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

const LeagueTierListSchema: Schema<
  LeagueTierList,
  LeagueTierListModel,
  TierListMethods
> = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_COACH_COLLECTION,
      required: true,
    },
    copiedFrom: {
      type: Schema.Types.ObjectId,
      ref: LEAGUE_TIER_LIST_COLLECTION,
    },
    pokemon: {
      type: Map,
      of: LeagueTierListPokemonSchema,
      default: {},
    },
    tiers: [LeagueTierSchema],
    banned: {
      moves: [{ type: String }],
      abilities: [{ type: String }],
    },
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
    collaborators: [
      { type: Schema.Types.ObjectId, ref: LEAGUE_COACH_COLLECTION },
    ],
    settings: {
      type: {
        isPublic: { type: Boolean, required: true, default: false },
        shareToken: { type: String },
      },
      required: true,
      default: () => ({ isPublic: false }),
    },
  },
  { timestamps: true },
);

LeagueTierListSchema.methods.getPokemonCost = function (
  this: LeagueTierListDocument,
  pokemonId: string,
  addons?: string[],
): number | undefined {
  const pokemon = this.pokemon.get(pokemonId);

  if (!pokemon) return undefined;

  if (addons && addons.length && pokemon.addons) {
    const addon = pokemon.addons.find((a) => a.name === addons[0]);
    if (addon) return addon.cost;
  }

  const tier = this.tiers.find((t: LeagueTier) => t.name === pokemon.tier);
  return tier ? tier.cost : undefined;
};

LeagueTierListSchema.methods.getTierByName = function (
  this: LeagueTierListDocument,
  tierName: string,
): LeagueTier | undefined {
  return this.tiers.find((t: LeagueTier) => t.name === tierName);
};

LeagueTierListSchema.methods.getPokemonIds = function (
  this: LeagueTierListDocument,
): string[] {
  return Array.from(this.pokemon.keys());
};

export default model<LeagueTierList, LeagueTierListModel>(
  LEAGUE_TIER_LIST_COLLECTION,
  LeagueTierListSchema,
);
