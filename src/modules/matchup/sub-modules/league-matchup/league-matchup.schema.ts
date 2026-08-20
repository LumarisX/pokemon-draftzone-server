import { generateSlug } from "@core/slug";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

const MATCH_SIDES = ["side1", "side2"] as const;
const MATCH_WINNERS = [...MATCH_SIDES, "draw"] as const;
const MATCH_STATUSES = ["pending", "approved"] as const;
const MATCH_ADVANCEMENTS = ["side1", "side2", "none"] as const;
const POKEMON_STATUSES = ["brought", "survived", "fainted"] as const;

export type LeagueMatchupWinner = (typeof MATCH_WINNERS)[number];
export type LeagueMatchupStatus = (typeof MATCH_STATUSES)[number];
export type LeagueMatchupAdvancement = (typeof MATCH_ADVANCEMENTS)[number];
export type PokemonResultStatus = (typeof POKEMON_STATUSES)[number];

@Schema({ _id: false })
export class PokemonKillsEntity {
  @Prop()
  direct?: number;

  @Prop()
  indirect?: number;

  @Prop()
  teammate?: number;
}
export const PokemonKillsSchema = SchemaFactory.createForClass(
  PokemonKillsEntity,
);

@Schema({ _id: false })
export class PokemonResultStatsEntity {
  @Prop({ type: PokemonKillsSchema })
  kills?: PokemonKillsEntity;

  @Prop({ type: String, enum: POKEMON_STATUSES, required: true })
  status!: PokemonResultStatus;
}
export const PokemonResultStatsSchema = SchemaFactory.createForClass(
  PokemonResultStatsEntity,
);

@Schema({ _id: false })
export class MatchSideResultEntity {
  @Prop({ required: true, min: 0 })
  score!: number;

  @Prop({ type: Map, of: PokemonResultStatsSchema, default: {} })
  pokemon!: Map<string, PokemonResultStatsEntity>;
}
export const MatchSideResultSchema = SchemaFactory.createForClass(
  MatchSideResultEntity,
);

@Schema({ _id: false })
export class MatchResultEntity {
  @Prop({ trim: true })
  replay?: string;

  @Prop({ type: String, enum: MATCH_WINNERS, required: true })
  winner!: LeagueMatchupWinner;

  @Prop({ type: MatchSideResultSchema, required: true })
  side1!: MatchSideResultEntity;

  @Prop({ type: MatchSideResultSchema, required: true })
  side2!: MatchSideResultEntity;
}
export const MatchResultSchema = SchemaFactory.createForClass(
  MatchResultEntity,
);

@Schema({ _id: false })
export class MatchupReportEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ required: true })
  submittedBy!: string;

  @Prop()
  submittedByName?: string;

  @Prop({ default: () => new Date() })
  submittedAt!: Date;

  @Prop({ type: [MatchResultSchema], default: [] })
  results!: MatchResultEntity[];

  @Prop({ min: 0 })
  side1Score?: number;

  @Prop({ min: 0 })
  side2Score?: number;

  @Prop({ type: String, enum: MATCH_WINNERS })
  winner?: LeagueMatchupWinner;

  @Prop()
  forfeit?: boolean;

  @Prop({ trim: true })
  notes?: string;
}
export const MatchupReportSchema = SchemaFactory.createForClass(
  MatchupReportEntity,
);

@Schema({ _id: false })
export class MatchSideSlotEntity {
  @Prop({ type: String, enum: ["seed", "winner", "loser"], required: true })
  type!: "seed" | "winner" | "loser";

  @Prop()
  seed?: number;

  @Prop()
  matchId?: string;
}
export const MatchSideSlotSchema = SchemaFactory.createForClass(
  MatchSideSlotEntity,
);

@Schema({ _id: false })
export class MatchSideEntity {
  // Ref name is a literal string to avoid pulling team.schema.ts into the
  // matchup/division/team import chain unnecessarily.
  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ type: MatchSideSlotSchema })
  slot?: MatchSideSlotEntity;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ min: 0 })
  score?: number;
}
export const MatchSideSchema = SchemaFactory.createForClass(MatchSideEntity);

export type LeagueMatchupDocument = HydratedDocument<LeagueMatchupEntity>;

@Schema({
  timestamps: true,
  collection: "leaguematchups",
})
export class LeagueMatchupEntity {
  /**
   * URL identifier for the matchup page. Globally unique, so the route needs
   * no stage segment to disambiguate it — `slot.matchId` and the chat room's
   * `target` still key off `_id`, which is what actually joins documents.
   */
  @Prop({ required: true, unique: true, index: true, default: generateSlug })
  slug!: string;

  // References a subdocument _id inside StageEntity.rounds[], not a
  // top-level collection — same as the legacy schema, intentionally no ref.
  @Prop({ type: SchemaTypes.ObjectId, index: true })
  round?: Types.ObjectId;

  // Ref name is a literal string to avoid pulling stage.schema.ts into the
  // matchup/stage/team import chain unnecessarily.
  @Prop({ type: SchemaTypes.ObjectId, ref: "StageEntity", index: true })
  stage?: Types.ObjectId;

  // Denormalized copy of StagePoolEntity.poolKey — lets matchup queries
  // filter by pool without cross-referencing team membership.
  @Prop()
  pool?: string;

  // Bracket layout metadata, set at generation time. `section` groups
  // matches into visual groups (winners/losers/finals for double elim);
  // `bracketRound`/`position` are the column/row within that section. Flat
  // schedule views ignore all three.
  @Prop()
  section?: string;

  @Prop()
  bracketRound?: number;

  @Prop()
  position?: number;

  @Prop({ trim: true })
  label?: string;

  @Prop({ type: MatchSideSchema, required: true })
  side1!: MatchSideEntity;

  @Prop({ type: MatchSideSchema, required: true })
  side2!: MatchSideEntity;

  @Prop({ type: [MatchResultSchema], default: [] })
  results!: MatchResultEntity[];

  @Prop({ trim: true })
  notes?: string;

  @Prop()
  scheduledDate?: Date;

  @Prop({ type: String, enum: MATCH_WINNERS })
  winner?: LeagueMatchupWinner;

  @Prop()
  forfeit?: boolean;

  @Prop({ type: String, enum: MATCH_STATUSES })
  status?: LeagueMatchupStatus;

  /**
   * Organizer override for which side leaves this match, used when `winner`
   * cannot answer that on its own.
   *
   * A double forfeit is the case it exists for: it is a settled result with no
   * winning side, so every downstream `winner`/`loser` slot would otherwise
   * stay empty forever and the rest of the bracket could never be played.
   * `"none"` says nobody advances — a deliberate answer, not an unanswered one.
   */
  @Prop({ type: String, enum: MATCH_ADVANCEMENTS })
  advances?: LeagueMatchupAdvancement;

  @Prop({ type: MatchupReportSchema })
  report?: MatchupReportEntity;
}

export const LeagueMatchupSchema = SchemaFactory.createForClass(
  LeagueMatchupEntity,
);

LeagueMatchupSchema.index({ "side1.team": 1 });
LeagueMatchupSchema.index({ "side2.team": 1 });
// Advancing a result looks matchups up by the match their slot consumes, and
// that lookup is not scoped to a stage — a playoff slot is fed by a match in
// the group stage before it. Without these it is a full collection scan.
LeagueMatchupSchema.index({ "side1.slot.matchId": 1 });
LeagueMatchupSchema.index({ "side2.slot.matchId": 1 });
