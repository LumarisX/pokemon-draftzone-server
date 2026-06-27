import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

const STAGE_TYPES = [
  "round-robin",
  "single-elimination",
  "double-elimination",
  "swiss",
  "custom",
] as const;
export type StageType = (typeof STAGE_TYPES)[number];

@Schema({ _id: false })
export class StageTradePokemonEntity {
  @Prop({ required: true })
  id!: string;

  @Prop({ type: [String], default: undefined })
  addons?: string[];
}
export const StageTradePokemonSchema = SchemaFactory.createForClass(
  StageTradePokemonEntity,
);

@Schema({ _id: false })
export class StageTradeSideEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ type: [StageTradePokemonSchema], required: true })
  pokemon!: StageTradePokemonEntity[];
}
export const StageTradeSideSchema =
  SchemaFactory.createForClass(StageTradeSideEntity);

@Schema({ _id: false })
export class StageTradeEntity {
  @Prop({ type: StageTradeSideSchema, required: true })
  side1!: StageTradeSideEntity;

  @Prop({ type: StageTradeSideSchema, required: true })
  side2!: StageTradeSideEntity;

  @Prop({ default: () => new Date(), required: true })
  timestamp!: Date;

  @Prop({ default: -1 })
  activeRound!: number;

  @Prop({
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "APPROVED",
  })
  status!: "PENDING" | "APPROVED" | "REJECTED";
}
export const StageTradeSchema = SchemaFactory.createForClass(StageTradeEntity);

@Schema()
export class StageRoundEntity {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  matchDeadline?: Date;

  @Prop()
  tradeDeadline?: Date;

  @Prop()
  bestOf?: number;
}
export const StageRoundSchema = SchemaFactory.createForClass(StageRoundEntity);

@Schema({ _id: false })
export class StagePoolEntity {
  @Prop({ required: true })
  poolKey!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "TeamEntity", default: [] })
  teamIds!: Types.ObjectId[];
}
export const StagePoolSchema = SchemaFactory.createForClass(StagePoolEntity);

export type StageDocument = HydratedDocument<StageEntity>;

@Schema({
  timestamps: true,
  collection: "leaguestages",
})
export class StageEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  @Prop({ required: true })
  order!: number;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, enum: STAGE_TYPES, required: true })
  type!: StageType;

  @Prop({ type: [StageRoundSchema], default: [] })
  rounds!: StageRoundEntity[];

  @Prop({ type: [StagePoolSchema], default: [] })
  pools!: StagePoolEntity[];

  @Prop({ type: [StageTradeSchema], default: [] })
  trades!: StageTradeEntity[];

  @Prop({ default: -1 })
  currentRoundIndex!: number;
}

export const StageSchema = SchemaFactory.createForClass(StageEntity);

StageSchema.index({ tournamentId: 1, order: 1 });
