import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type CoachDocument = HydratedDocument<CoachEntity>;

@Schema({
  timestamps: true,
  collection: "leaguecoaches",
})
export class CoachEntity {
  @Prop({ required: true, index: true })
  auth0Id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  gameName!: string;

  @Prop({ required: true })
  discordName!: string;

  @Prop({ required: true })
  timezone!: string;

  @Prop({ required: true })
  experience!: string;

  @Prop({ required: true, default: false })
  droppedBefore!: boolean;

  @Prop()
  droppedWhy?: string;

  @Prop({ required: true, default: false })
  confirmed!: boolean;

  // Ref name is a literal string (not TeamEntity.name) to avoid a circular
  // import with team.schema.ts, which refs back to CoachEntity.
  @Prop({ type: Types.ObjectId, ref: "TeamEntity", required: true })
  teamId!: Types.ObjectId;

  @Prop({ default: () => new Date() })
  signedUpAt!: Date;
}

export const CoachSchema = SchemaFactory.createForClass(CoachEntity);
