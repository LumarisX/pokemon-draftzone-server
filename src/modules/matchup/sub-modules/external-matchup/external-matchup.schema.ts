import {
  PokemonEntity,
  PokemonSchema,
} from "@modules/pokemon/pokemon.schema";
import { ExternalTournamentEntity } from "@modules/tournament/sub-modules/external-tournament/external-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";
import {
  ExternalMatchEntity,
  FORFEIT_SIDES,
  ForfeitSide,
  MATCH_WINNERS,
  MatchDataSchema,
  MatchWinner,
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

  @Prop({ required: true })
  stage!: string;

  @Prop({ default: undefined })
  notes?: string;

  @Prop({ type: [MatchDataSchema], required: true })
  matches!: ExternalMatchEntity[];

  @Prop({ type: Date, default: undefined })
  scheduledDate?: Date;

  @Prop({ type: String, trim: true, default: undefined })
  opponentTimezone?: string;

  @Prop({ type: [Number], default: undefined })
  scoreOverride?: [number, number];

  @Prop({ type: String, enum: MATCH_WINNERS, default: undefined })
  winnerOverride?: MatchWinner;

  @Prop({ type: String, enum: FORFEIT_SIDES, default: undefined })
  forfeitedBy?: ForfeitSide;
}

export const ExternalMatchupSchema = SchemaFactory.createForClass(
  ExternalMatchupEntity,
);
