import { generateSlug } from "@core/slug";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { PokemonEntity, PokemonSchema } from "@modules/pokemon/pokemon.schema";
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

  @Prop({ required: true, default: generateSlug })
  slug!: string;

  @Prop({ required: true, type: String })
  format!: FormatId;

  @Prop({ required: true, type: String })
  ruleset!: RulesetId;

  @Prop({ required: true, type: String, ref: "users" })
  owner!: string;

  @Prop({ default: undefined })
  doc?: string;

  @Prop({ default: undefined })
  coach?: string;

  @Prop({ type: [PokemonSchema], required: true })
  team!: PokemonEntity[];

  /**
   * Set when the owner archives the league; unset (not nulled) when they
   * restore it. Queries filter on `archivedAt: null`, which matches both the
   * unset and the absent case, so documents predating this field read as
   * active without a backfill.
   */
  @Prop({ type: Date, default: undefined })
  archivedAt?: Date;
}

export const ExternalTournamentSchema = SchemaFactory.createForClass(
  ExternalTournamentEntity,
);

ExternalTournamentSchema.index({ owner: 1, slug: 1 }, { unique: true });
ExternalTournamentSchema.index({ owner: 1, archivedAt: 1 });

ExternalTournamentSchema.virtual("matchups", {
  ref: "ExternalMatchupEntity",
  localField: "_id",
  foreignField: "aTeam._id",
  options: { sort: { createdAt: -1 } },
});
