import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

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
export class ExternalMatchTeamEntity {
  @Prop({ type: [[String, PokemonStatsSchema]], required: true })
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

  @Prop({ type: String })
  winner?: "a" | "b";
}
export const MatchDataSchema =
  SchemaFactory.createForClass(ExternalMatchEntity);
