import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { HostedTournamentEntity } from "./hosted-tournament.schema";

export type OrganizerInviteDocument = HydratedDocument<OrganizerInviteEntity>;

@Schema({ timestamps: true, collection: "organizerinvites" })
export class OrganizerInviteEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

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

export const OrganizerInviteSchema = SchemaFactory.createForClass(
  OrganizerInviteEntity,
);
