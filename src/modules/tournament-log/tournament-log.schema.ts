import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export const TOURNAMENT_LOG_TYPES = [
  "tier-list.attached",
  "tier-list.swapped",
  "tier-list.edited",
  "tier-list.pulled",
  "tier-list.reverted",
  "settings.unlocked",
  "settings.changed",
] as const;

export type TournamentLogType = (typeof TOURNAMENT_LOG_TYPES)[number];

export const LOG_VISIBILITIES = ["participants", "public"] as const;
export type LogVisibility = (typeof LOG_VISIBILITIES)[number];

@Schema({ _id: false })
export class TournamentLogTargetEntity {
  @Prop({ required: true })
  kind!: string;

  @Prop()
  id?: string;

  @Prop()
  name?: string;
}
export const TournamentLogTargetSchema = SchemaFactory.createForClass(
  TournamentLogTargetEntity,
);

export type TournamentLogDocument = HydratedDocument<TournamentLogEntity>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: "tournamentlogs",
})
export class TournamentLogEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: "HostedTournamentEntity",
    required: true,
  })
  tournament!: Types.ObjectId;

  @Prop({ required: true })
  seq!: number;

  @Prop({ required: true })
  actor!: string;

  @Prop()
  actorName?: string;

  @Prop({ type: String, enum: TOURNAMENT_LOG_TYPES, required: true })
  type!: TournamentLogType;

  @Prop({ required: true })
  summary!: string;

  @Prop({ type: TournamentLogTargetSchema })
  target?: TournamentLogTargetEntity;

  @Prop({ type: SchemaTypes.Mixed })
  before?: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  after?: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  details?: Record<string, unknown>;

  @Prop()
  reason?: string;

  createdAt?: Date;
}

export const TournamentLogSchema =
  SchemaFactory.createForClass(TournamentLogEntity);

TournamentLogSchema.index({ tournament: 1, seq: -1 }, { unique: true });
TournamentLogSchema.index({ tournament: 1, type: 1, seq: -1 });
