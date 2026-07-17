import { LeagueEntity } from "@modules/league/league.schema";
import {
  DraftCountEntity,
  DraftCountSchema,
} from "@modules/tier-list/tier-list.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ _id: false })
export class TierRequirementEntity {
  @Prop({ required: true })
  tierName!: string;

  @Prop({ required: true })
  required!: number;
}
export const TierRequirementSchema = SchemaFactory.createForClass(
  TierRequirementEntity,
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

@Schema({ _id: false })
export class TournamentDiscordSettingsEntity {
  @Prop()
  guildId?: string;

  @Prop()
  coachRoleId?: string;

  @Prop()
  signUpChannelId?: string;
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

export type HostedTournamentDocument = HydratedDocument<HostedTournamentEntity>;

@Schema({
  timestamps: true,
  collection: "leaguetournaments",
})
export class HostedTournamentEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  tournamentKey!: string;

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

  @Prop({ type: TournamentForfeitSchema, required: true })
  forfeit!: TournamentForfeitEntity;

  @Prop({ type: String, enum: ["pokemon", "game"], required: true })
  diffMode!: "pokemon" | "game";

  @Prop({ required: true })
  format!: string;

  @Prop({ required: true })
  ruleset!: string;

  @Prop({ type: DraftCountSchema, required: true })
  draftCount!: DraftCountEntity;

  @Prop()
  pointTotal?: number;

  @Prop({ type: [TierRequirementSchema], default: [] })
  tierRequirements!: TierRequirementEntity[];

  @Prop()
  archived?: boolean;

  @Prop({ type: TournamentAdSettingsSchema })
  adSettings?: TournamentAdSettingsEntity;

  createdAt?: Date;
}

export const HostedTournamentSchema = SchemaFactory.createForClass(
  HostedTournamentEntity,
);
