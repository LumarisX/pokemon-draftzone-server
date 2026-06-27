import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ _id: false })
export class TierListPokemonAddonEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  cost!: number;

  @Prop()
  notes?: string;
}
export const TierListPokemonAddonSchema = SchemaFactory.createForClass(
  TierListPokemonAddonEntity,
);

@Schema({ _id: false })
export class TierListPokemonEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  tier!: string;

  @Prop()
  notes?: string;

  @Prop({ type: [TierListPokemonAddonSchema], default: undefined })
  addons?: TierListPokemonAddonEntity[];

  @Prop()
  banned?: boolean;
}
export const TierListPokemonSchema = SchemaFactory.createForClass(
  TierListPokemonEntity,
);

@Schema({ _id: false })
export class TierEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  cost!: number;

  @Prop()
  color?: string;
}
export const TierSchema = SchemaFactory.createForClass(TierEntity);

@Schema({ _id: false })
export class DraftCountEntity {
  @Prop({ required: true })
  min!: number;

  @Prop({ required: true })
  max!: number;
}
export const DraftCountSchema = SchemaFactory.createForClass(DraftCountEntity);

@Schema({ _id: false })
export class TierListBannedEntity {
  @Prop({ type: [String], default: [] })
  moves!: string[];

  @Prop({ type: [String], default: [] })
  abilities!: string[];
}
export const TierListBannedSchema =
  SchemaFactory.createForClass(TierListBannedEntity);

@Schema({ _id: false })
export class TierListSettingsEntity {
  @Prop({ required: true, default: false })
  isPublic!: boolean;

  @Prop()
  shareToken?: string;
}
export const TierListSettingsSchema = SchemaFactory.createForClass(
  TierListSettingsEntity,
);

export type TierListDocument = HydratedDocument<TierListEntity>;

@Schema({
  timestamps: true,
  collection: "leaguetierlists",
})
export class TierListEntity {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  createdBy!: string;

  // Self-reference (a tier list copied from another tier list) — literal
  // string since the class can't reference its own name from within its
  // own member decorator while still being defined.
  @Prop({ type: SchemaTypes.ObjectId, ref: "TierListEntity" })
  copiedFrom?: Types.ObjectId;

  @Prop({ type: Map, of: TierListPokemonSchema, default: {} })
  pokemon!: Map<string, TierListPokemonEntity>;

  @Prop({ type: [TierSchema], default: [] })
  tiers!: TierEntity[];

  @Prop({
    type: TierListBannedSchema,
    default: () => ({ moves: [], abilities: [] }),
  })
  banned!: TierListBannedEntity;

  @Prop()
  pointTotal?: number;

  @Prop({ type: DraftCountSchema, required: true })
  draftCount!: DraftCountEntity;

  @Prop({ required: true })
  format!: string;

  @Prop({ required: true })
  ruleset!: string;

  @Prop({ type: [String], default: [] })
  collaborators!: string[];

  @Prop({
    type: TierListSettingsSchema,
    required: true,
    default: () => ({ isPublic: false }),
  })
  settings!: TierListSettingsEntity;
}

export const TierListSchema = SchemaFactory.createForClass(TierListEntity);
