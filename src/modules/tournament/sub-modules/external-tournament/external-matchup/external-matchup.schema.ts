import { PokemonSchema, PokemonData } from "@modules/pokemon/pokemon.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";
import { ExternalTournamentEntity } from "../external-tournament.schema";

export type ExternalMatchupDocument = HydratedDocument<ExternalMatchupEntity>;

@Schema({ _id: false })
export class MatchupTeamReferenceEntity {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    ref: ExternalTournamentEntity.name,
  })
  _id!: Types.ObjectId | ExternalTournamentEntity;

  @Prop({ type: String })
  paste?: string;
}

@Schema({ _id: false })
export class MatchupTeamFullEntity {
  @Prop({ required: true })
  teamName!: string;

  @Prop({ type: String })
  coach?: string;

  @Prop({ type: [PokemonSchema], required: true })
  team!: PokemonData[];

  @Prop({ type: String })
  paste?: string;
}

@Schema({ _id: false })
export class PokemonStatsEntity {
  @Prop({ type: Number })
  indirect?: number;

  @Prop({ type: Number })
  kills?: number;

  @Prop({ type: Number })
  deaths?: number;

  @Prop({ type: Number })
  brought?: number;
}
const PokemonStatsSchema = SchemaFactory.createForClass(PokemonStatsEntity);

@Schema({ _id: false })
export class MatchTeamEntity {
  @Prop({ type: [[String, PokemonStatsSchema]], required: true })
  stats!: [string, PokemonStatsEntity][];

  @Prop({ type: Number, default: 0 })
  score!: number;
}
const MatchTeamSchema = SchemaFactory.createForClass(MatchTeamEntity);

@Schema({ _id: false })
export class MatchDataEntity {
  @Prop({ type: MatchTeamSchema, required: true })
  aTeam!: MatchTeamEntity;

  @Prop({ type: MatchTeamSchema, required: true })
  bTeam!: MatchTeamEntity;

  @Prop({ type: String })
  replay?: string;

  @Prop({ type: String })
  winner?: "a" | "b";
}
const MatchDataSchema = SchemaFactory.createForClass(MatchDataEntity);

@Schema({
  timestamps: true,
  collection: "matchups",
})
export class ExternalMatchupEntity {
  @Prop({ type: MatchupTeamReferenceEntity, required: true })
  aTeam!: MatchupTeamReferenceEntity;

  @Prop({ type: MatchupTeamFullEntity, required: true })
  bTeam!: MatchupTeamFullEntity;

  @Prop({ type: String })
  gameTime?: string;

  @Prop({ type: Number })
  reminder?: number;

  @Prop({ required: true })
  stage!: string;

  @Prop({ default: undefined })
  notes?: string;

  @Prop({ type: [MatchDataSchema], required: true })
  matches!: MatchDataEntity[];
}

export const ExternalMatchupSchema = SchemaFactory.createForClass(
  ExternalMatchupEntity,
);
