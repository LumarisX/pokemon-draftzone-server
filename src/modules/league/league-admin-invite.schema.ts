import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { LeagueEntity } from "./league.schema";

export type LeagueAdminInviteDocument =
  HydratedDocument<LeagueAdminInviteEntity>;

@Schema({ timestamps: true, collection: "leagueadmininvites" })
export class LeagueAdminInviteEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: LeagueEntity.name,
    required: true,
    index: true,
  })
  leagueId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  acceptedBy?: string;

  @Prop()
  acceptedAt?: Date;

  createdAt?: Date;
}

export const LeagueAdminInviteSchema = SchemaFactory.createForClass(
  LeagueAdminInviteEntity,
);
