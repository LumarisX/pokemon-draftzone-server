import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ExternalTournamentAdDocument =
  HydratedDocument<ExternalTournamentAdEntity>;

class SkillLevelRange {
  @Prop({ required: true })
  from!: string;

  @Prop({ required: true })
  to!: string;
}

@Schema({ timestamps: true, collection: "leagueads" })
export class ExternalTournamentAdEntity {
  @Prop({ required: true, trim: true })
  leagueName!: string;

  @Prop({ required: true })
  owner!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ trim: true, default: "" })
  leagueDoc!: string;

  @Prop({ trim: true, default: "" })
  serverLink!: string;

  @Prop({ type: SkillLevelRange, required: true })
  skillLevelRange!: SkillLevelRange;

  @Prop({ required: true, enum: ["0", "1", "2", "3", "4"] })
  prizeValue!: "0" | "1" | "2" | "3" | "4";

  @Prop({
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length >= 1,
      message: "At least one platform is required",
    },
  })
  platforms!: string[];

  @Prop({
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length >= 1,
      message: "At least one format is required",
    },
  })
  formats!: string[];

  @Prop({
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length >= 1,
      message: "At least one ruleset is required",
    },
  })
  rulesets!: string[];

  @Prop({ required: true, trim: true })
  signupLink!: string;

  @Prop({
    type: String,
    enum: ["Approved", "Denied", "Pending"],
    default: "Pending",
    required: true,
  })
  status!: "Approved" | "Denied" | "Pending";

  @Prop({ required: true })
  closesAt!: Date;

  @Prop()
  seasonStart?: Date;

  @Prop()
  seasonEnd?: Date;

  createdAt?: Date;
}

export const ExternalTournamentAdSchema = SchemaFactory.createForClass(
  ExternalTournamentAdEntity,
);
