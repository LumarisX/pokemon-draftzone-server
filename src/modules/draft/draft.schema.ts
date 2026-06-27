import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ _id: false })
export class DraftEventLogEntity {
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
export const DraftEventLogSchema = SchemaFactory.createForClass(
  DraftEventLogEntity,
);

export type DraftDocument = HydratedDocument<DraftEntity>;

@Schema({
  timestamps: true,
  collection: "leaguedrafts",
})
export class DraftEntity {
  @Prop({ required: true })
  draftKey!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  @Prop({ default: false })
  public!: boolean;

  // Draft-state machine fields, promoted from the old embedded
  // DivisionDraftEntity to top-level fields on this collection.
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

  @Prop({ type: [DraftEventLogSchema], default: [] })
  eventLog!: DraftEventLogEntity[];

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

export const DraftSchema = SchemaFactory.createForClass(DraftEntity);

DraftSchema.index({ tournamentId: 1, draftKey: 1 }, { unique: true });
