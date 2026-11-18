import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserSignInDocument = HydratedDocument<UserSignInEntity>;

@Schema({ timestamps: true, collection: "usersignins" })
export class UserSignInEntity {
  @Prop({ type: String, required: true, unique: true })
  signIn!: string;

  @Prop({ type: String, required: true, index: true })
  accountId!: string;

  @Prop({ type: Boolean, required: true, default: false })
  blocked!: boolean;

  @Prop({ type: Date })
  blockedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSignInSchema = SchemaFactory.createForClass(UserSignInEntity);
