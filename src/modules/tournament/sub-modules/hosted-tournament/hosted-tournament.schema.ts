import { generateSlug } from "@core/slug";
import { LeagueEntity } from "@modules/league/league.schema";
import {
  DraftCountEntity,
  DraftCountSchema,
} from "@modules/tier-list/tier-list.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ _id: false })
export class OrganizerNameEntity {
  @Prop({ required: true })
  sub!: string;

  @Prop({ required: true })
  name!: string;
}
export const OrganizerNameSchema =
  SchemaFactory.createForClass(OrganizerNameEntity);

@Schema({ _id: false })
export class TierRequirementEntity {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  tierId!: Types.ObjectId;

  @Prop({ required: true })
  required!: number;

  @Prop()
  max?: number;
}
export const TierRequirementSchema = SchemaFactory.createForClass(
  TierRequirementEntity,
);

@Schema({ _id: false })
export class PrizeShareEntity {
  @Prop({ required: true })
  place!: number;

  @Prop({ required: true })
  percent!: number;
}
export const PrizeShareSchema = SchemaFactory.createForClass(PrizeShareEntity);

/**
 * One row of the tournament's schedule.
 *
 * Rounds live here, not on a stage: every stage running at the same time
 * shares the round, and therefore its deadlines. A group phase in weeks 1-3
 * and a playoff bracket in weeks 4-5 are two stages on one axis.
 */
@Schema()
export class TournamentRoundEntity {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  matchDeadline?: Date;

  @Prop()
  tradeDeadline?: Date;
}
export const TournamentRoundSchema = SchemaFactory.createForClass(
  TournamentRoundEntity,
);

@Schema({ _id: false })
export class TournamentTradePokemonEntity {
  @Prop({ required: true })
  id!: string;

  /**
   * Draft add-ons carried with the pick ("Tera Captain"), mirroring
   * `StageTradePokemonEntity`. Stored as the add-on list rather than a `tera`
   * flag because that is the shape the migration copies up from stage trades,
   * and the shape readers already derive `tera` from.
   */
  @Prop({ type: [String], default: undefined })
  addons?: string[];
}
export const TournamentTradePokemonSchema = SchemaFactory.createForClass(
  TournamentTradePokemonEntity,
);

@Schema({ _id: false })
export class TournamentTradeSideEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ type: [TournamentTradePokemonSchema], required: true })
  pokemon!: TournamentTradePokemonEntity[];

  /** Trade points this side's team is charged. Absent on pre-feature trades. */
  @Prop({ default: 0 })
  tradePoints?: number;
}
export const TournamentTradeSideSchema = SchemaFactory.createForClass(
  TournamentTradeSideEntity,
);

/**
 * A trade between two teams, effective from a round.
 *
 * Trades sit on the tournament rather than a stage because the round they take
 * effect in is tournament-wide — a roster change made during the group phase
 * still holds when the playoffs start.
 */
@Schema()
export class TournamentTradeEntity {
  _id!: Types.ObjectId;

  @Prop({ type: TournamentTradeSideSchema, required: true })
  side1!: TournamentTradeSideEntity;

  @Prop({ type: TournamentTradeSideSchema, required: true })
  side2!: TournamentTradeSideEntity;

  @Prop({ default: () => new Date(), required: true })
  timestamp!: Date;

  /** Index into the tournament's round list. */
  @Prop({ default: -1 })
  activeRound!: number;

  @Prop({
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "APPROVED",
  })
  status!: "PENDING" | "APPROVED" | "REJECTED";

  /**
   * Auth0 sub of whoever filed the trade — a coach on one of the sides, or an
   * organizer entering it on their behalf. Absent on trades predating the field.
   */
  @Prop()
  submittedBy?: string;

  /**
   * Auth0 sub of the organizer who approved or rejected it. Equal to
   * `submittedBy` when an organizer files a trade, since that approves it.
   */
  @Prop()
  resolvedBy?: string;
}
export const TournamentTradeSchema = SchemaFactory.createForClass(
  TournamentTradeEntity,
);

@Schema({ _id: false })
export class TournamentRuleEntity {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: "" })
  body!: string;
}
export const TournamentRuleSchema =
  SchemaFactory.createForClass(TournamentRuleEntity);

export const SIGNUP_ACCESS_MODES = ["open", "invite", "closed"] as const;

export type SignUpAccessMode = (typeof SIGNUP_ACCESS_MODES)[number];

export const SIGNUP_QUESTION_TYPES = [
  "short",
  "long",
  "choice",
  "multi",
  "boolean",
] as const;

export type SignUpQuestionType = (typeof SIGNUP_QUESTION_TYPES)[number];

@Schema({ _id: false })
export class SignUpQuestionDependencyEntity {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ required: true })
  equals!: string;
}
export const SignUpQuestionDependencySchema = SchemaFactory.createForClass(
  SignUpQuestionDependencyEntity,
);

@Schema({ _id: false })
export class SignUpQuestionEntity {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  label!: string;

  @Prop()
  help?: string;

  @Prop({ type: String, enum: SIGNUP_QUESTION_TYPES, required: true })
  type!: SignUpQuestionType;

  @Prop({ type: [String], default: [] })
  options!: string[];

  @Prop({ required: true, default: false })
  required!: boolean;

  @Prop()
  maxLength?: number;

  @Prop({ type: SignUpQuestionDependencySchema })
  dependsOn?: SignUpQuestionDependencyEntity;

  @Prop({ required: true, default: false })
  archived!: boolean;
}
export const SignUpQuestionSchema =
  SchemaFactory.createForClass(SignUpQuestionEntity);

@Schema({ _id: false })
export class TournamentDiscordSettingsEntity {
  @Prop()
  guildId?: string;

  @Prop()
  coachRoleId?: string;

  @Prop()
  signUpChannelId?: string;

  @Prop({ default: true })
  autoGrantCoachRole!: boolean;
}
export const TournamentDiscordSettingsSchema = SchemaFactory.createForClass(
  TournamentDiscordSettingsEntity,
);

@Schema({ _id: false })
export class TournamentAdSkillLevelRangeEntity {
  @Prop({ required: true })
  from!: string;

  @Prop({ required: true })
  to!: string;
}
export const TournamentAdSkillLevelRangeSchema = SchemaFactory.createForClass(
  TournamentAdSkillLevelRangeEntity,
);

@Schema({ _id: false })
export class TournamentAdSettingsEntity {
  @Prop({ required: true, default: false })
  advertise!: boolean;

  @Prop({ type: TournamentAdSkillLevelRangeSchema })
  skillLevelRange?: TournamentAdSkillLevelRangeEntity;

  @Prop({ type: String, enum: ["0", "1", "2", "3", "4"] })
  prizeValue?: "0" | "1" | "2" | "3" | "4";

  @Prop({ type: [String], default: [] })
  platforms!: string[];
}
export const TournamentAdSettingsSchema = SchemaFactory.createForClass(
  TournamentAdSettingsEntity,
);

@Schema({ _id: false })
export class TournamentForfeitEntity {
  @Prop({ required: true, default: 0 })
  gameDiff!: number;

  @Prop({ required: true, default: 0 })
  pokemonDiff!: number;
}
export const TournamentForfeitSchema = SchemaFactory.createForClass(
  TournamentForfeitEntity,
);

@Schema({ _id: false })
export class TournamentMatchSettingsEntity {
  @Prop({ default: true })
  chat!: boolean;

  @Prop({ default: true })
  coachReporting!: boolean;
}
export const TournamentMatchSettingsSchema = SchemaFactory.createForClass(
  TournamentMatchSettingsEntity,
);

export type HostedTournamentDocument = HydratedDocument<HostedTournamentEntity>;

@Schema({
  timestamps: true,
  collection: "leaguetournaments",
})
export class HostedTournamentEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true, default: generateSlug })
  slug!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  signUpDeadline!: Date;

  @Prop()
  draftStart?: Date;

  @Prop()
  draftEnd?: Date;

  @Prop()
  seasonStart?: Date;

  @Prop()
  seasonEnd?: Date;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: LeagueEntity.name,
    required: true,
    index: true,
  })
  league!: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  organizers!: string[];

  @Prop({ type: [OrganizerNameSchema], default: [] })
  organizerNames!: OrganizerNameEntity[];

  @Prop({ type: SchemaTypes.ObjectId })
  tierList?: Types.ObjectId;

  @Prop({ type: [TournamentRuleSchema], default: [] })
  rules!: TournamentRuleEntity[];

  @Prop()
  logo?: string;

  @Prop()
  discord?: string;

  @Prop({ type: TournamentDiscordSettingsSchema })
  discordSettings?: TournamentDiscordSettingsEntity;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "StageEntity", default: [] })
  stages!: Types.ObjectId[];

  @Prop({ default: -1 })
  currentStageIndex!: number;

  /**
   * The schedule every stage is laid out against — `LeagueMatchup.round`
   * points at one of these subdocuments.
   *
   * Empty only on a tournament that has never had a stage. The
   * sections-to-stages migration filled this for every tournament that had
   * one; `StageEntity.rounds` is the deprecated copy it was filled from, kept
   * so the rollback has something to restore.
   */
  @Prop({ type: [TournamentRoundSchema], default: [] })
  rounds!: TournamentRoundEntity[];

  /** Index into `rounds`; -1 before the season starts. */
  @Prop({ default: -1 })
  currentRoundIndex!: number;

  @Prop({ type: [TournamentTradeSchema], default: [] })
  trades!: TournamentTradeEntity[];

  @Prop({ type: TournamentForfeitSchema, required: true })
  forfeit!: TournamentForfeitEntity;

  @Prop({ type: String, enum: ["pokemon", "game"], required: true })
  diffMode!: "pokemon" | "game";

  @Prop({ type: DraftCountSchema, required: true })
  draftCount!: DraftCountEntity;

  @Prop()
  pointTotal?: number;

  @Prop()
  maxTeams?: number;

  @Prop({ type: [SignUpQuestionSchema], default: [] })
  signUpQuestions!: SignUpQuestionEntity[];

  @Prop({
    type: String,
    enum: SIGNUP_ACCESS_MODES,
    required: true,
    default: "open",
  })
  signUpAccess!: SignUpAccessMode;

  @Prop()
  signUpToken?: string;

  @Prop()
  signUpTokenRotatedAt?: Date;

  /** Trade points each team may spend across a stage. Unset means no cap. */
  @Prop()
  tradePointLimit?: number;

  @Prop({ type: [TierRequirementSchema], default: [] })
  tierRequirements!: TierRequirementEntity[];

  @Prop({ type: [PrizeShareSchema], default: [] })
  prizeSplit!: PrizeShareEntity[];

  @Prop()
  archived?: boolean;

  @Prop({ type: TournamentAdSettingsSchema })
  adSettings?: TournamentAdSettingsEntity;

  @Prop({ type: TournamentMatchSettingsSchema })
  matchSettings?: TournamentMatchSettingsEntity;

  createdAt?: Date;
}

export const HostedTournamentSchema = SchemaFactory.createForClass(
  HostedTournamentEntity,
);
