import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import type { TierListChange, TierListState } from "./tier-list.state";

export const REVISION_KINDS = [
  "create",
  "edit",
  "import",
  "revert",
  "pull",
  "fork",
  "copy",
] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

export type TierListRevisionDocument = HydratedDocument<TierListRevisionEntity>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: "tierlistrevisions" })
export class TierListRevisionEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "TierListEntity", required: true })
  tierList!: Types.ObjectId;

  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  actor!: string;

  @Prop()
  actorName?: string;

  @Prop({ type: String, enum: REVISION_KINDS, required: true })
  kind!: RevisionKind;

  @Prop({ required: true })
  summary!: string;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  changes!: TierListChange[];

  @Prop({ type: SchemaTypes.Mixed, required: true })
  state!: TierListState;

  @Prop()
  restoredFrom?: number;

  createdAt?: Date;
}

export const TierListRevisionSchema = SchemaFactory.createForClass(
  TierListRevisionEntity,
);

TierListRevisionSchema.index({ tierList: 1, version: -1 }, { unique: true });
