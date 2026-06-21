import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema({ _id: false })
export class DivisionTradePokemonEntity {
  @Prop({ required: true })
  id!: string;

  @Prop({ type: [String], default: undefined })
  addons?: string[];
}
export const DivisionTradePokemonSchema = SchemaFactory.createForClass(
  DivisionTradePokemonEntity,
);

@Schema({ _id: false })
export class DivisionTradeSideEntity {
  // Ref name is a literal string to avoid a circular import with team.schema.ts.
  @Prop({ type: Types.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ type: [DivisionTradePokemonSchema], required: true })
  pokemon!: DivisionTradePokemonEntity[];
}
export const DivisionTradeSideSchema = SchemaFactory.createForClass(
  DivisionTradeSideEntity,
);

@Schema({ _id: false })
export class DivisionTradeEntity {
  @Prop({ type: DivisionTradeSideSchema, required: true })
  side1!: DivisionTradeSideEntity;

  @Prop({ type: DivisionTradeSideSchema, required: true })
  side2!: DivisionTradeSideEntity;

  @Prop({ default: () => new Date(), required: true })
  timestamp!: Date;

  @Prop({ default: -1 })
  activeStage!: number;

  @Prop({
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "APPROVED",
  })
  status!: "PENDING" | "APPROVED" | "REJECTED";
}
export const DivisionTradeSchema = SchemaFactory.createForClass(
  DivisionTradeEntity,
);

@Schema()
export class DivisionStageEntity {
  // Not a @Prop() — Mongoose adds this to array subdocuments automatically
  // unless `_id: false` is set; declared here only so TS knows it exists.
  _id!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  matchDeadline?: Date;

  @Prop()
  tradeDeadline?: Date;
}
export const DivisionStageSchema = SchemaFactory.createForClass(
  DivisionStageEntity,
);

@Schema({ _id: false })
export class DivisionDraftEventLogEntity {
  @Prop({
    type: String,
    enum: ["PICK", "SKIP", "TIMER_START", "TIMER_PAUSE"],
    required: true,
  })
  eventType!: "PICK" | "SKIP" | "TIMER_START" | "TIMER_PAUSE";

  @Prop()
  details?: string;

  @Prop({ default: () => new Date() })
  timestamp!: Date;
}
export const DivisionDraftEventLogSchema = SchemaFactory.createForClass(
  DivisionDraftEventLogEntity,
);

@Schema({ _id: false })
export class DivisionDraftEntity {
  @Prop({
    type: String,
    enum: ["PRE_DRAFT", "IN_PROGRESS", "PAUSED", "COMPLETED"],
    default: "PRE_DRAFT",
  })
  status!: "PRE_DRAFT" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

  @Prop({ default: true })
  sequentialTurns!: boolean;

  @Prop({ type: String, enum: ["snake", "linear"], default: "snake" })
  orderProgression!: "snake" | "linear";

  @Prop()
  remainingTime?: number;

  @Prop({ default: 0 })
  counter!: number;

  @Prop({ type: [DivisionDraftEventLogSchema], default: [] })
  eventLog!: DivisionDraftEventLogEntity[];

  @Prop({ default: 30 })
  skipTimerPenalty!: number;

  @Prop()
  skipTime?: Date;

  @Prop()
  channelId?: string;

  @Prop()
  timerLength?: number;

  @Prop({ default: true })
  useRandomSeeding?: boolean;

  @Prop({ type: String, enum: ["ALL", "SELF"], default: "ALL" })
  visibility!: "ALL" | "SELF";

  @Prop({ default: false })
  allowRemovals!: boolean;
}
export const DivisionDraftSchema = SchemaFactory.createForClass(
  DivisionDraftEntity,
);

export type DivisionDocument = HydratedDocument<DivisionEntity>;

@Schema({
  timestamps: true,
  collection: "leaguedivisions",
})
export class DivisionEntity {
  @Prop({ required: true })
  divisionKey!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({
    type: Types.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  @Prop({ default: false })
  public!: boolean;

  @Prop({ type: [DivisionTradeSchema], default: [] })
  trades!: DivisionTradeEntity[];

  @Prop({ default: -1 })
  currentStage!: number;

  @Prop({ type: [DivisionStageSchema], default: [] })
  stages!: DivisionStageEntity[];

  @Prop({ type: DivisionDraftSchema, required: true })
  draft!: DivisionDraftEntity;
}

export const DivisionSchema = SchemaFactory.createForClass(DivisionEntity);

DivisionSchema.index({ tournamentId: 1, divisionKey: 1 }, { unique: true });
