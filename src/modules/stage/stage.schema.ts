import { generateSlug } from "@core/slug";
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

  /** Trade points this side's team is charged. Absent on pre-feature trades. */
  @Prop({ default: 0 })
  tradePoints?: number;
}
export const StageTradeSideSchema =
  SchemaFactory.createForClass(StageTradeSideEntity);

@Schema()
export class StageTradeEntity {
  _id!: Types.ObjectId;

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

const SECTION_KINDS = [
  "main",
  "winners",
  "losers",
  "finals",
  "round-robin",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/**
 * Presentation metadata for one section of a bracket. A stage may be composed
 * of several independently-configured blocks, so section keys are namespaced
 * ("playoffs--winners") and `kind` is what carries the structural role that
 * auto titles key off.
 */
@Schema({ _id: false })
export class StageSectionEntity {
  @Prop({ required: true })
  key!: string;

  @Prop()
  title?: string;

  @Prop({ type: String, enum: SECTION_KINDS })
  kind?: SectionKind;

  /** Name of the configured block this section belongs to. */
  @Prop()
  label?: string;

  @Prop({ default: 0 })
  order?: number;

  /** Teams entering this section, for "Round of N" titles. */
  @Prop()
  teamCount?: number;

  /**
   * The pool whose standings this section produces. A group stage section
   * gets its own table; sections sharing a pool (a winners/losers pair) share
   * one. Absent on brackets saved before sections were linked to pools.
   */
  @Prop()
  poolKey?: string;

  @Prop({ type: SchemaTypes.Mixed })
  roundTitles?: Record<number, string>;
}
export const StageSectionSchema =
  SchemaFactory.createForClass(StageSectionEntity);

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

  /**
   * Section this entry seeded. Absent on entries written before brackets could
   * be composed from several blocks, which seeded the whole stage at once.
   */
  @Prop()
  label?: string;

  /** Seed numbers this entry covers, inclusive. Absent for whole-stage entries. */
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
  /** URL identifier for every stage-scoped page and endpoint. */
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

  /**
   * Hidden stages are listed and readable only by organizers, so a bracket can
   * be built before it goes live. Defaults to visible so stages predating this
   * field (which have no value stored) keep showing up.
   */
  @Prop({ default: true })
  public!: boolean;

  /**
   * Teams entering this stage, in seed order — seed N is `teamIds[N - 1]`.
   *
   * Replaces `pools`, which existed to hold several sections' teams in one
   * stage. A stage is now one section, so it has exactly one list.
   */
  @Prop({ type: [SchemaTypes.ObjectId], ref: "TeamEntity", default: [] })
  teamIds!: Types.ObjectId[];

  /**
   * @deprecated Rounds moved to the tournament, which is what all its stages
   * actually share. Kept readable until the sections-to-stages migration has
   * run everywhere; the rollback reads it too.
   */
  @Prop({ type: [StageRoundSchema], default: [] })
  rounds!: StageRoundEntity[];

  /**
   * @deprecated Superseded by `teamIds`. A stage held one pool per section;
   * now a stage is a section. Kept readable for the migration and rollback.
   */
  @Prop({ type: [StagePoolSchema], default: [] })
  pools!: StagePoolEntity[];

  /**
   * @deprecated Each section became its own stage. Kept readable so the
   * migration can name the stages it creates, and so rollback can rebuild it.
   */
  @Prop({ type: [StageSectionSchema], default: [] })
  sections!: StageSectionEntity[];

  /**
   * @deprecated Trades moved to the tournament, because the round a trade
   * takes effect in is tournament-wide. Kept readable for the migration.
   */
  @Prop({ type: [StageTradeSchema], default: [] })
  trades!: StageTradeEntity[];

  @Prop({ type: [StageSeedingSchema], default: [] })
  seedingLog!: StageSeedingEntity[];

  /**
   * @deprecated Moved to the tournament along with the rounds it indexes.
   */
  @Prop({ default: -1 })
  currentRoundIndex!: number;
}

export const StageSchema = SchemaFactory.createForClass(StageEntity);

StageSchema.index({ tournamentId: 1, order: 1 });
