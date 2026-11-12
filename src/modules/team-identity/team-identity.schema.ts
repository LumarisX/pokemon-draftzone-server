import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type TeamIdentityDocument = HydratedDocument<TeamIdentityEntity>;

@Schema({ timestamps: true, collection: "teamidentities" })
export class TeamIdentityEntity {
  @Prop({ required: true })
  owner!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  nameKey!: string;

  @Prop()
  logo?: string;

  @Prop({ required: true })
  lastUsedAt!: Date;

  @Prop()
  active?: boolean;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
}

export const TeamIdentitySchema =
  SchemaFactory.createForClass(TeamIdentityEntity);
TeamIdentitySchema.index(
  { owner: 1, nameKey: 1, logo: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
TeamIdentitySchema.index({ owner: 1, active: 1, lastUsedAt: -1 });
