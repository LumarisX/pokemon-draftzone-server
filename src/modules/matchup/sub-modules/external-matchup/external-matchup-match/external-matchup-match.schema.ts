import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema } from "mongoose";

export const POKEMON_STATUSES = ["brought", "survived", "fainted"] as const;
export type PokemonResultStatus = (typeof POKEMON_STATUSES)[number];

export const MATCH_WINNERS = ["a", "b"] as const;
export type MatchWinner = (typeof MATCH_WINNERS)[number];

export const FORFEIT_SIDES = ["a", "b", "both"] as const;
export type ForfeitSide = (typeof FORFEIT_SIDES)[number];

@Schema({ _id: false })
export class PokemonStatsEntity {
  @Prop({ type: Number })
  indirect?: number;

  @Prop({ type: Number })
  kills?: number;

  @Prop({ type: Number })
  teammate?: number;

  @Prop({ type: Number })
  deaths?: number;

  @Prop({ type: Number })
  brought?: number;

  @Prop({ type: String, enum: POKEMON_STATUSES })
  status?: PokemonResultStatus;
}

export const KO_NOTE_MAX_LENGTH = 200;

@Schema({ _id: false })
export class MatchPokemonRefEntity {
  @Prop({ type: String, enum: MATCH_WINNERS, required: true })
  team!: MatchWinner;

  @Prop({ type: String, required: true })
  pokemon!: string;
}
const MatchPokemonRefSchema = SchemaFactory.createForClass(
  MatchPokemonRefEntity,
);

@Schema({ _id: false })
export class ExternalMatchKoEntity {
  @Prop({ type: MatchPokemonRefSchema, required: true })
  victim!: MatchPokemonRefEntity;

  @Prop({ type: MatchPokemonRefSchema })
  attacker?: MatchPokemonRefEntity;

  @Prop({ type: Boolean, default: false })
  indirect!: boolean;

  @Prop({ type: String, maxlength: KO_NOTE_MAX_LENGTH })
  note?: string;
}
const MatchKoSchema = SchemaFactory.createForClass(ExternalMatchKoEntity);

@Schema({ _id: false })
export class ExternalMatchTeamEntity {
  @Prop({ type: [MongooseSchema.Types.Mixed], required: true })
  stats!: [string, PokemonStatsEntity][];

  @Prop({ type: Number, default: 0 })
  score!: number;
}
const MatchTeamSchema = SchemaFactory.createForClass(ExternalMatchTeamEntity);

@Schema({ _id: false })
export class ExternalMatchEntity {
  @Prop({ type: MatchTeamSchema, required: true })
  aTeam!: ExternalMatchTeamEntity;

  @Prop({ type: MatchTeamSchema, required: true })
  bTeam!: ExternalMatchTeamEntity;

  @Prop({ type: String })
  replay?: string;

  @Prop({ type: String, enum: MATCH_WINNERS })
  winner?: MatchWinner;

  @Prop({ type: [MatchKoSchema], default: undefined })
  kos?: ExternalMatchKoEntity[];
}
export const MatchDataSchema =
  SchemaFactory.createForClass(ExternalMatchEntity);
