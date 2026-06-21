import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type LeagueDocument = HydratedDocument<LeagueEntity>;

@Schema({
  timestamps: true,
  collection: "leagues",
})
export class LeagueEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  leagueKey!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  owner!: string;

  @Prop()
  logo?: string;
}

export const LeagueSchema = SchemaFactory.createForClass(LeagueEntity);
