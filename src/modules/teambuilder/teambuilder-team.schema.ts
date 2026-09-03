import { generateSlug } from "@core/slug";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const TEAM_CONTEXT_TYPES = ["matchup", "standalone"] as const;

export type TeamContextType = (typeof TEAM_CONTEXT_TYPES)[number];

export const TEAM_MAX_SETS = 24;

@Schema({ _id: false })
export class SetStatsEntity {
  @Prop({ type: Number, default: 0 })
  hp!: number;

  @Prop({ type: Number, default: 0 })
  atk!: number;

  @Prop({ type: Number, default: 0 })
  def!: number;

  @Prop({ type: Number, default: 0 })
  spa!: number;

  @Prop({ type: Number, default: 0 })
  spd!: number;

  @Prop({ type: Number, default: 0 })
  spe!: number;
}

export const SetStatsSchema = SchemaFactory.createForClass(SetStatsEntity);

@Schema({ _id: false })
export class PokemonSetEntity {
  @Prop({ required: true })
  id!: string;

  @Prop()
  nickname?: string;

  @Prop({ required: true, default: 100 })
  level!: number;

  @Prop({ type: String, enum: ["", "M", "F"], default: "" })
  gender!: "" | "M" | "F";

  @Prop({ default: false })
  shiny!: boolean;

  @Prop()
  ability?: string;

  @Prop()
  item?: string;

  @Prop()
  nature?: string;

  @Prop()
  teraType?: string;

  @Prop({ type: [String], default: [] })
  moves!: (string | null)[];

  @Prop({ type: SetStatsSchema, required: true })
  ivs!: SetStatsEntity;

  @Prop({ type: SetStatsSchema, required: true })
  evs!: SetStatsEntity;

  @Prop({ type: SetStatsSchema, required: true })
  sps!: SetStatsEntity;

  @Prop({ default: 255 })
  happiness!: number;

  @Prop({ default: 10 })
  dynamaxLevel!: number;

  @Prop({ default: false })
  gigantamax!: boolean;

  @Prop()
  hpType?: string;

  @Prop()
  pokeball?: string;
}

export const PokemonSetSchema = SchemaFactory.createForClass(PokemonSetEntity);

@Schema({ _id: false })
export class TeamContextEntity {
  @Prop({ type: String, enum: TEAM_CONTEXT_TYPES, required: true })
  type!: TeamContextType;

  @Prop({ default: "" })
  id!: string;
}

export const TeamContextSchema =
  SchemaFactory.createForClass(TeamContextEntity);

export type TeambuilderTeamDocument = HydratedDocument<TeambuilderTeamEntity>;

@Schema({
  timestamps: true,
  collection: "teambuilderteams",
})
export class TeambuilderTeamEntity {
  @Prop({ required: true, default: generateSlug, unique: true })
  slug!: string;

  @Prop({ required: true, index: true })
  userSub!: string;

  @Prop({ type: TeamContextSchema, required: true })
  context!: TeamContextEntity;

  @Prop({ default: "" })
  name!: string;

  @Prop({ required: true })
  ruleset!: string;

  @Prop({ default: 100 })
  level!: number;

  @Prop({ type: [PokemonSetSchema], default: [] })
  sets!: PokemonSetEntity[];
}

export const TeambuilderTeamSchema = SchemaFactory.createForClass(
  TeambuilderTeamEntity,
);

TeambuilderTeamSchema.index({
  userSub: 1,
  "context.type": 1,
  "context.id": 1,
});
