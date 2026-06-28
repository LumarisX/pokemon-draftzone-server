import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema } from "mongoose";

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

@Schema({ _id: false })
export class ExternalMatchTeamEntity {
  // TODO(migrate-to-map): stored as `[pokemonId, stats]` tuples. Mongoose has
  // no tuple element schema (`[[String, Schema]]` silently drops the data on
  // read/save and throws a CastError on `$set` updates), so this is typed as
  // Mixed and the tuple shape is enforced by the mapper. Migrate to
  // `Map<string, PokemonStatsEntity>` once existing documents are converted.
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

  @Prop({ type: String })
  winner?: "a" | "b";
}
export const MatchDataSchema =
  SchemaFactory.createForClass(ExternalMatchEntity);
