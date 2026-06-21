import { LeagueEntity } from "@modules/league/league.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema({ _id: false })
export class TournamentRuleEntity {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: "" })
  body!: string;
}
export const TournamentRuleSchema =
  SchemaFactory.createForClass(TournamentRuleEntity);

@Schema()
export class TournamentRoundEntity {
  @Prop({ required: true })
  name!: string;

  @Prop()
  matchDeadline?: Date;
}
export const TournamentRoundSchema = SchemaFactory.createForClass(
  TournamentRoundEntity,
);

@Schema()
export class TournamentStageEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({
    type: String,
    enum: ["round-robin", "single-elimination", "double-elimination", "custom"],
    required: true,
  })
  type!: "round-robin" | "single-elimination" | "double-elimination" | "custom";

  @Prop({ type: [TournamentRoundSchema], default: [] })
  rounds!: TournamentRoundEntity[];
}
export const TournamentStageSchema = SchemaFactory.createForClass(
  TournamentStageEntity,
);

@Schema({ _id: false })
export class TournamentPlayoffsEntity {
  @Prop({ type: [Types.ObjectId], default: [] })
  teams!: Types.ObjectId[];
}
export const TournamentPlayoffsSchema = SchemaFactory.createForClass(
  TournamentPlayoffsEntity,
);

@Schema({ _id: false })
export class TournamentForfeitEntity {
  @Prop({ required: true, default: 0 })
  gameDiff!: number;

  @Prop({ required: true, default: 0 })
  pokemonDiff!: number;
}
export const TournamentForfeitSchema = SchemaFactory.createForClass(
  TournamentForfeitEntity,
);

export type HostedTournamentDocument = HydratedDocument<HostedTournamentEntity>;

@Schema({
  timestamps: true,
  collection: "leaguetournaments",
})
export class HostedTournamentEntity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  tournamentKey!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  signUpDeadline!: Date;

  @Prop()
  draftStart?: Date;

  @Prop()
  draftEnd?: Date;

  @Prop()
  seasonStart?: Date;

  @Prop()
  seasonEnd?: Date;

  @Prop({ type: Types.ObjectId, ref: LeagueEntity.name, required: true, index: true })
  league!: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  organizers!: string[];

  @Prop({ type: Types.ObjectId })
  tierList?: Types.ObjectId;

  @Prop({ type: [TournamentRuleSchema], default: [] })
  rules!: TournamentRuleEntity[];

  @Prop()
  logo?: string;

  @Prop()
  discord?: string;

  @Prop({ type: TournamentPlayoffsSchema })
  playoffs?: TournamentPlayoffsEntity;

  @Prop({ type: [TournamentStageSchema], default: [] })
  stages!: TournamentStageEntity[];

  @Prop({ type: TournamentForfeitSchema, required: true })
  forfeit!: TournamentForfeitEntity;

  @Prop({ type: String, enum: ["pokemon", "game"], required: true })
  diffMode!: "pokemon" | "game";
}

export const HostedTournamentSchema = SchemaFactory.createForClass(
  HostedTournamentEntity,
);
