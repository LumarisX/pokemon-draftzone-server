import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { FormatId } from "../../../../data/formats";
import { RulesetId } from "../../../../data/rulesets";
import { PokemonData, PokemonSchema } from "@modules/pokemon/pokemon.schema";

export type ExternalTournamentDocument =
  HydratedDocument<ExternalTournamentEntity>;

class DraftScore {
  @Prop({ required: true, default: 0 })
  wins!: number;

  @Prop({ required: true, default: 0 })
  losses!: number;

  @Prop({ required: true, default: "0" })
  diff!: string;
}

@Schema({
  timestamps: true,
  collection: "drafts",
})
export class ExternalTournamentEntity {
  @Prop({ required: true })
  leagueName!: string;

  @Prop({ required: true })
  teamName!: string;

  @Prop({ required: true })
  leagueId!: string;

  @Prop({ required: true, type: String })
  format!: FormatId;

  @Prop({ required: true, type: String })
  ruleset!: RulesetId;

  @Prop({ required: true, type: String, ref: "users" })
  owner!: string;

  @Prop({ default: undefined })
  doc?: string;

  @Prop({ type: [PokemonSchema], required: true })
  team!: PokemonData[];

  @Prop({ type: DraftScore, required: true })
  score!: DraftScore;
}

export const ExternalTournamentSchema = SchemaFactory.createForClass(
  ExternalTournamentEntity,
);

ExternalTournamentSchema.index({ owner: 1, leagueId: 1 }, { unique: true });
