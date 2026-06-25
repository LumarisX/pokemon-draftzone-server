import {
  PokemonEntity,
  PokemonSchema,
} from "@modules/draft-pokemon/draft-pokemon.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const ARCHIVE_COLLECTION = "archives";

@Schema({ _id: false })
export class ArchivePokemonRefEntity {
  @Prop({ required: true })
  id!: string;
}
export const ArchivePokemonRefSchema = SchemaFactory.createForClass(
  ArchivePokemonRefEntity,
);

@Schema({ _id: false })
export class ArchiveStatEntity {
  @Prop()
  indirect?: number;

  @Prop()
  kills?: number;

  @Prop()
  deaths?: number;

  @Prop()
  brought?: number;
}
export const ArchiveStatSchema =
  SchemaFactory.createForClass(ArchiveStatEntity);

export type ArchiveStatTuple = [string, ArchiveStatEntity];

@Schema({ _id: false })
export class ArchiveMatchV1Entity {
  @Prop({ enum: ["a", "b"] })
  winner?: "a" | "b";

  @Prop()
  teamName?: string;

  @Prop({ required: true })
  stage!: string;

  @Prop({ type: [[String, ArchiveStatSchema]] })
  stats!: ArchiveStatTuple[];

  @Prop({ type: [Number, Number], required: true, default: [0, 0] })
  score!: [number, number];

  @Prop()
  replay?: string;
}
export const ArchiveMatchV1Schema =
  SchemaFactory.createForClass(ArchiveMatchV1Entity);

@Schema({ _id: false })
export class ArchiveMatchTeamV2Entity {
  @Prop({ type: [[String, ArchiveStatSchema]], required: true })
  stats!: ArchiveStatTuple[];

  @Prop({ default: 0 })
  score!: number;
}
export const ArchiveMatchTeamV2Schema = SchemaFactory.createForClass(
  ArchiveMatchTeamV2Entity,
);

@Schema({ _id: false })
export class ArchiveMatchV2Entity {
  @Prop({ type: ArchiveMatchTeamV2Schema, required: true })
  aTeam!: ArchiveMatchTeamV2Entity;

  @Prop({ type: ArchiveMatchTeamV2Schema, required: true })
  bTeam!: ArchiveMatchTeamV2Entity;

  @Prop()
  replay?: string;

  @Prop({ enum: ["a", "b"] })
  winner?: "a" | "b";
}
export const ArchiveMatchV2Schema =
  SchemaFactory.createForClass(ArchiveMatchV2Entity);

@Schema({ _id: false })
export class ArchiveMatchupStatsTeamEntity {
  @Prop({ required: true, default: 0 })
  wins!: number;

  @Prop({ type: Map, of: ArchiveStatSchema, default: {} })
  stats!: Map<string, ArchiveStatEntity>;

  @Prop({ required: true, default: 0 })
  differential!: number;
}
export const ArchiveMatchupStatsTeamSchema = SchemaFactory.createForClass(
  ArchiveMatchupStatsTeamEntity,
);

@Schema({ _id: false })
export class ArchiveMatchupStatsEntity {
  @Prop({ enum: ["a", "b"] })
  winner?: "a" | "b";

  @Prop({ type: ArchiveMatchupStatsTeamSchema, required: true })
  aTeam!: ArchiveMatchupStatsTeamEntity;

  @Prop({ type: ArchiveMatchupStatsTeamSchema, required: true })
  bTeam!: ArchiveMatchupStatsTeamEntity;
}
export const ArchiveMatchupStatsSchema = SchemaFactory.createForClass(
  ArchiveMatchupStatsEntity,
);

@Schema({ _id: false })
export class ArchiveMatchupPastesEntity {
  @Prop()
  aTeam?: string;

  @Prop()
  bTeam?: string;
}
export const ArchiveMatchupPastesSchema = SchemaFactory.createForClass(
  ArchiveMatchupPastesEntity,
);

@Schema({ _id: false })
export class ArchiveMatchupV2Entity {
  @Prop()
  teamName?: string;

  @Prop()
  coach?: string;

  @Prop({ type: [PokemonSchema] })
  team!: PokemonEntity[];

  @Prop()
  paste?: string;

  @Prop({ type: ArchiveMatchupPastesSchema, default: {} })
  pastes!: ArchiveMatchupPastesEntity;

  @Prop({ required: true })
  stage!: string;

  @Prop({ type: [ArchiveMatchV2Schema] })
  matches!: ArchiveMatchV2Entity[];

  @Prop({ type: ArchiveMatchupStatsSchema, default: {} })
  stats!: ArchiveMatchupStatsEntity;
}
export const ArchiveMatchupV2Schema = SchemaFactory.createForClass(
  ArchiveMatchupV2Entity,
);

@Schema({ _id: false })
export class ArchiveScoreEntity {
  @Prop({ required: true, default: 0 })
  wins!: number;

  @Prop({ required: true, default: 0 })
  losses!: number;

  @Prop({ required: true, default: "0" })
  diff!: string;
}
export const ArchiveScoreSchema =
  SchemaFactory.createForClass(ArchiveScoreEntity);

export type ArchiveDocument = HydratedDocument<ArchiveEntity>;

@Schema({
  timestamps: true,
  collection: ARCHIVE_COLLECTION,
  discriminatorKey: "archiveType",
})
export class ArchiveEntity {
  // Populated by the `timestamps: true` / `discriminatorKey` schema options
  // below, not @Prop() (re-declaring them would duplicate the auto-managed
  // paths) -- declared here only so TS knows they exist on the document.
  createdAt?: Date;
  updatedAt?: Date;
  archiveType?: "ArchiveV1" | "ArchiveV2";

  @Prop({ required: true })
  leagueName!: string;

  @Prop({ required: true })
  teamName!: string;

  @Prop({ required: true, ref: "users" })
  owner!: string;

  @Prop({ required: true })
  format!: string;

  @Prop({ required: true })
  ruleset!: string;

  @Prop({ type: [ArchivePokemonRefSchema] })
  team!: ArchivePokemonRefEntity[];
}
export const ArchiveSchema = SchemaFactory.createForClass(ArchiveEntity);

export type ArchiveV1Document = HydratedDocument<ArchiveV1Entity>;

@Schema()
export class ArchiveV1Entity extends ArchiveEntity {
  @Prop({ type: [ArchiveMatchV1Schema] })
  matches!: ArchiveMatchV1Entity[];
}
export const ArchiveV1Schema = SchemaFactory.createForClass(ArchiveV1Entity);

export type ArchiveV2Document = HydratedDocument<ArchiveV2Entity>;

@Schema()
export class ArchiveV2Entity extends ArchiveEntity {
  @Prop({ required: true })
  leagueId!: string;

  @Prop()
  doc?: string;

  @Prop({ type: Map, of: ArchiveStatSchema, default: {} })
  stats!: Map<string, ArchiveStatEntity>;

  @Prop({ type: ArchiveScoreSchema, required: true })
  score!: ArchiveScoreEntity;

  @Prop({ type: [ArchiveMatchupV2Schema] })
  matchups!: ArchiveMatchupV2Entity[];
}
export const ArchiveV2Schema = SchemaFactory.createForClass(ArchiveV2Entity);
