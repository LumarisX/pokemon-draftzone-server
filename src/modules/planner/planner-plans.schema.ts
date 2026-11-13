import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { StoredPlan } from "./planner-plans.domain";

export type PlannerPlansDocument = HydratedDocument<PlannerPlansEntity>;

@Schema({
  timestamps: true,
  collection: "plannerplans",
})
export class PlannerPlansEntity {
  @Prop({ required: true })
  owner!: string;

  @Prop({ required: true })
  key!: string;

  @Prop({ required: true, default: 1, min: 1 })
  revision!: number;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  plans!: StoredPlan[];

  updatedAt?: Date;
}

export const PlannerPlansSchema =
  SchemaFactory.createForClass(PlannerPlansEntity);
PlannerPlansSchema.index({ owner: 1, key: 1 }, { unique: true });
