import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import {
  PokemonEntity,
  PokemonSchema,
} from "@modules/pokemon/pokemon.schema";
import { FormatId } from "@core/data/formats/formats";
import { RulesetId } from "@core/data/rulesets/rulesets";

export type ExternalTournamentDocument =
  HydratedDocument<ExternalTournamentEntity>;

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
  team!: PokemonEntity[];
}

export const ExternalTournamentSchema = SchemaFactory.createForClass(
  ExternalTournamentEntity,
);

ExternalTournamentSchema.index({ owner: 1, leagueId: 1 }, { unique: true });

ExternalTournamentSchema.virtual("matchups", {
  ref: "ExternalMatchupEntity",
  localField: "_id",
  foreignField: "aTeam._id",
});
