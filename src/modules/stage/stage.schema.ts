import { generateSlug } from "@core/slug";
import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

const STAGE_TYPES = [
  "round-robin",
  "single-elimination",
  "double-elimination",
  "triple-elimination",
  "swiss",
  "custom",
] as const;
export type StageType = (typeof STAGE_TYPES)[number];
export const STAGE_TYPE_VALUES: readonly string[] = STAGE_TYPES;

const ENTRANT_KINDS = ["team", "place", "open"] as const;
export type StageEntrantKind = (typeof ENTRANT_KINDS)[number];

@Schema({ _id: false })
export class StageEntrantEntity {
  @Prop({ type: String, enum: ENTRANT_KINDS, required: true })
  kind!: StageEntrantKind;

  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  sourceStage?: Types.ObjectId;

  @Prop()
  place?: number;
}
export const StageEntrantSchema =
  SchemaFactory.createForClass(StageEntrantEntity);

const SEEDING_METHODS = ["certified-random", "manual"] as const;
export type SeedingMethod = (typeof SEEDING_METHODS)[number];

@Schema({ _id: false })
export class StageSeedingEntity {
  @Prop({ type: String, enum: SEEDING_METHODS, required: true })
  method!: SeedingMethod;

  @Prop({ default: () => new Date(), required: true })
  seededAt!: Date;

  @Prop({ required: true })
  seededBy!: string;

  @Prop()
  inputTeamsHash?: string;

  @Prop()
  algorithmVersion?: string;

  @Prop()
  label?: string;

  @Prop()
  seedFrom?: number;

  @Prop()
  seedTo?: number;
}
export const StageSeedingSchema =
  SchemaFactory.createForClass(StageSeedingEntity);

export type StageDocument = HydratedDocument<StageEntity>;

@Schema({
  timestamps: true,
  collection: "leaguestages",
})
export class StageEntity {
  @Prop({ required: true, unique: true, index: true, default: generateSlug })
  slug!: string;

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

  @Prop({ default: true })
  public!: boolean;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "TeamEntity", default: [] })
  teamIds!: Types.ObjectId[];

  @Prop({ type: [StageEntrantSchema], default: [] })
  entrants!: StageEntrantEntity[];

  @Prop({ type: [StageSeedingSchema], default: [] })
  seedingLog!: StageSeedingEntity[];
}

export const StageSchema = SchemaFactory.createForClass(StageEntity);

StageSchema.index({ tournamentId: 1, order: 1 });
