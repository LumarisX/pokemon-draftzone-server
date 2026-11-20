import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export enum UserRole {
  OWNER = "owner",
  ADMIN = "admin",
  DEV = "dev",
  TOURNAMENT_CREATOR = "tournament-creator",
}

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({ _id: false })
export class UserSettingsEntity {
  @Prop({ type: Boolean })
  shinyUnlock?: boolean;

  @Prop({ type: String })
  spriteSet?: string;

  @Prop({ type: String })
  theme?: string;

  @Prop({ type: String })
  ldMode?: string;

  @Prop({ type: String })
  themeOverride?: string;
}
export const UserSettingsSchema =
  SchemaFactory.createForClass(UserSettingsEntity);

@Schema({ _id: false })
export class UserProfileEntity {
  @Prop({ type: String })
  discordName?: string;

  @Prop({ type: String })
  gameName?: string;

  @Prop({ type: String })
  timezone?: string;
}
export const UserProfileSchema =
  SchemaFactory.createForClass(UserProfileEntity);

@Schema({ _id: false })
export class UserDiscordEntity {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  username!: string;

  @Prop({ type: Date, required: true })
  connectedAt!: Date;

  @Prop({ type: Date, required: true })
  refreshedAt!: Date;
}
export const UserDiscordSchema =
  SchemaFactory.createForClass(UserDiscordEntity);

@Schema({ timestamps: true, collection: "users" })
export class UserEntity {
  @Prop({ type: String, required: true, trim: true, unique: true, index: true })
  auth0Sub!: string;

  @Prop({ type: String, trim: true })
  username?: string;

  @Prop({ type: String })
  displayName?: string;

  @Prop({ type: UserProfileSchema })
  profile?: UserProfileEntity;

  @Prop({ type: UserDiscordSchema })
  discord?: UserDiscordEntity;

  @Prop({ type: Boolean })
  privateProfile?: boolean;

  @Prop({ type: [String], enum: UserRole, default: [] })
  roles!: UserRole[];

  @Prop({ type: Date, required: true })
  joined!: Date;

  @Prop({ type: Date, required: true })
  lastCheckedAdsAt!: Date;

  @Prop({ type: Date, required: true })
  lastLogin!: Date;

  @Prop({ type: UserSettingsSchema, required: true })
  settings!: UserSettingsEntity;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.index({ "discord.id": 1 }, { unique: true, sparse: true });
