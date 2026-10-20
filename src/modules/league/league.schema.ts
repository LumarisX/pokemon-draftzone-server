import { generateSlug } from "@core/slug";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type LeagueDocument = HydratedDocument<LeagueEntity>;

@Schema({ _id: false })
export class LeagueAdminEntity {
  @Prop({ required: true })
  sub!: string;

  @Prop({ required: true })
  name!: string;
}

const LeagueAdminSchema = SchemaFactory.createForClass(LeagueAdminEntity);

@Schema({
  timestamps: true,
  collection: "leagues",
})
export class LeagueEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true, default: generateSlug })
  slug!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  owner!: string;

  @Prop({ type: [LeagueAdminSchema], default: [] })
  admins!: LeagueAdminEntity[];

  @Prop()
  logo?: string;
}

export const LeagueSchema = SchemaFactory.createForClass(LeagueEntity);
LeagueSchema.index({ "admins.sub": 1 });
