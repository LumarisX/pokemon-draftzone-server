import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { TIER_LIST_ROLES, TierListRole } from "./tier-list.schema";

export type TierListInviteDocument = HydratedDocument<TierListInviteEntity>;

@Schema({ timestamps: true, collection: "tierlistinvites" })
export class TierListInviteEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: "TierListEntity",
    required: true,
    index: true,
  })
  tierList!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: String, enum: TIER_LIST_ROLES, required: true })
  role!: TierListRole;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: true, default: 1 })
  maxUses!: number;

  @Prop({ type: [String], default: [] })
  acceptedBy!: string[];

  createdAt?: Date;
}

export const TierListInviteSchema =
  SchemaFactory.createForClass(TierListInviteEntity);
