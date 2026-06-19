import {
  PokemonEntity,
  PokemonSchema,
} from "@modules/draft-pokemon/draft-pokemon.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";
import { ExternalTournamentEntity } from "../../../tournament/sub-modules/external-tournament/external-tournament.schema";
import {
  ExternalMatchEntity,
  MatchDataSchema,
} from "./external-matchup-match/external-matchup-match.schema";

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
  team!: PokemonEntity[];

  @Prop({ type: String })
  paste?: string;
}

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
  matches!: ExternalMatchEntity[];
}

export const ExternalMatchupSchema = SchemaFactory.createForClass(
  ExternalMatchupEntity,
);
