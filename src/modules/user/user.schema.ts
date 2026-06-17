import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

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

@Schema({ timestamps: true })
export class UserEntity {
  @Prop({ type: String, required: true, trim: true })
  auth0Sub!: string;

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
