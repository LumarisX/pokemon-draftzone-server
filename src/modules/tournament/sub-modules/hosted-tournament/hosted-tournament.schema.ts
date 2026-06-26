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

  // Ref name is a literal string to avoid pulling stage.schema.ts into the
  // tournament/stage import chain unnecessarily. Ordered list — a
  // tournament's stage sequence is this array's order, not derived from
  // each Stage's own `order` field (that field is informational/for
  // queries that only have a Stage, not the owning tournament, in hand).
  @Prop({ type: [Types.ObjectId], ref: "StageEntity", default: [] })
  stages!: Types.ObjectId[];

  @Prop({ default: -1 })
  currentStageIndex!: number;

  @Prop({ type: TournamentForfeitSchema, required: true })
  forfeit!: TournamentForfeitEntity;

  @Prop({ type: String, enum: ["pokemon", "game"], required: true })
  diffMode!: "pokemon" | "game";
}

export const HostedTournamentSchema = SchemaFactory.createForClass(
  HostedTournamentEntity,
);
