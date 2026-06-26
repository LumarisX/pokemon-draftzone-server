import { PokemonEntity, PokemonSchema } from "@modules/pokemon/pokemon.schema";
import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema({ _id: false })
export class TeamPickEntity {
  @Prop({ required: true })
  pokemonId!: string;

  @Prop({ type: [String], default: undefined })
  addons?: string[];
}
export const TeamPickSchema = SchemaFactory.createForClass(TeamPickEntity);

@Schema({ _id: false })
export class PickLogEntity {
  @Prop({ type: PokemonSchema, required: true })
  pokemon!: PokemonEntity;

  @Prop({ type: [String], default: undefined })
  addons?: string[];

  @Prop({ default: () => new Date() })
  timestamp!: Date;

  // Ref name is a literal string (not CoachEntity.name) to avoid a circular
  // import with coach.schema.ts, which refs back to TeamEntity.
  @Prop({ type: Types.ObjectId, ref: "CoachEntity", required: true })
  picker!: Types.ObjectId;
}
export const PickLogSchema = SchemaFactory.createForClass(PickLogEntity);

export type TeamDocument = HydratedDocument<TeamEntity>;

@Schema({
  timestamps: true,
  collection: "leagueteams",
})
export class TeamEntity {
  @Prop({
    type: Types.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  // Ref name is a literal string to avoid pulling draft.schema.ts into the
  // team/draft/stage import chain unnecessarily.
  @Prop({ type: Types.ObjectId, ref: "DraftEntity", index: true })
  draftId?: Types.ObjectId;

  // Ref name is a literal string (not CoachEntity.name) to avoid a circular
  // import with coach.schema.ts, which refs back to TeamEntity.
  @Prop({ type: Types.ObjectId, ref: "CoachEntity", required: true, unique: true })
  coach!: Types.ObjectId;

  @Prop({ required: true })
  teamName!: string;

  @Prop()
  logo?: string;

  @Prop({
    type: String,
    enum: ["approved", "pending", "denied"],
    default: "pending",
  })
  status!: "approved" | "pending" | "denied";

  @Prop({ type: [[TeamPickSchema]], default: [] })
  picks!: TeamPickEntity[][];

  @Prop({ type: [PickLogSchema], default: [] })
  pickLog!: PickLogEntity[];

  @Prop({ default: 0 })
  skipCount!: number;
}

export const TeamSchema = SchemaFactory.createForClass(TeamEntity);
