import { generateSlug } from "@core/slug";
import { LeagueEntity } from "@modules/league/league.schema";
import { STAFF_ROLES, StaffRole } from "@modules/tournament/tournament-policy";
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
export class TournamentStaffEntity {
  @Prop({ required: true })
  sub!: string;

  @Prop()
  name?: string;

  @Prop({ type: String, enum: STAFF_ROLES, required: true })
  role!: StaffRole;
}
export const TournamentStaffSchema = SchemaFactory.createForClass(
  TournamentStaffEntity,
);

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

  @Prop({ default: 0 })
  tradePoints?: number;
}
export const TournamentTradeSideSchema = SchemaFactory.createForClass(
  TournamentTradeSideEntity,
);

@Schema()
export class TournamentTradeEntity {
  _id!: Types.ObjectId;

  @Prop({ type: TournamentTradeSideSchema, required: true })
  side1!: TournamentTradeSideEntity;

  @Prop({ type: TournamentTradeSideSchema, required: true })
  side2!: TournamentTradeSideEntity;

  @Prop({ default: () => new Date(), required: true })
  timestamp!: Date;

  @Prop()
  activeRound?: number;

  @Prop({ type: SchemaTypes.ObjectId })
  activeRoundId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "APPROVED",
  })
  status!: "PENDING" | "APPROVED" | "REJECTED";

  @Prop()
  submittedBy?: string;

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

  @Prop()
  guildName?: string;

  @Prop()
  linkedAt?: Date;

  @Prop()
  linkedBy?: string;
}
export const TournamentDiscordSettingsSchema = SchemaFactory.createForClass(
  TournamentDiscordSettingsEntity,
);

@Schema({ _id: false })
export class TournamentDiscordLinkCodeEntity {
  @Prop({ required: true })
  hash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: true })
  createdBy!: string;
}
export const TournamentDiscordLinkCodeSchema = SchemaFactory.createForClass(
  TournamentDiscordLinkCodeEntity,
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

  @Prop({ type: [TournamentStaffSchema], default: [] })
  staff!: TournamentStaffEntity[];

  @Prop({ type: OrganizerNameSchema })
  ownerName?: OrganizerNameEntity;

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

  @Prop({ type: TournamentDiscordLinkCodeSchema })
  discordLinkCode?: TournamentDiscordLinkCodeEntity;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "StageEntity", default: [] })
  stages!: Types.ObjectId[];

  @Prop({ default: -1 })
  currentStageIndex!: number;

  @Prop({ type: [TournamentRoundSchema], default: [] })
  rounds!: TournamentRoundEntity[];

  @Prop({ default: -1 })
  currentRoundIndex!: number;

  @Prop({ type: [TournamentTradeSchema], default: [] })
  trades!: TournamentTradeEntity[];

  @Prop({ default: 0 })
  tradesVersion!: number;

  @Prop({ default: 0 })
  rosterVersion!: number;

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

HostedTournamentSchema.index({ "discordLinkCode.hash": 1 }, { sparse: true });
