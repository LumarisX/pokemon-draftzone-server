import { generateSlug } from "@core/slug";
import { PokemonEntity, PokemonSchema } from "@modules/pokemon/pokemon.schema";
import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export const TEAM_STATUSES = ["approved", "dropped"] as const;

export type TeamStatus = (typeof TEAM_STATUSES)[number];

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

  @Prop({ type: SchemaTypes.ObjectId, ref: "CoachEntity", required: true })
  picker!: Types.ObjectId;
}
export const PickLogSchema = SchemaFactory.createForClass(PickLogEntity);

@Schema({ _id: false })
export class TeamNameChangeEntity {
  @Prop({ required: true })
  from!: string;

  @Prop({ required: true })
  to!: string;

  @Prop()
  round?: number;

  @Prop({ type: SchemaTypes.ObjectId })
  roundId?: Types.ObjectId;

  @Prop()
  reason?: string;

  @Prop()
  changedBy?: string;

  @Prop({ default: () => new Date() })
  changedAt!: Date;
}
export const TeamNameChangeSchema =
  SchemaFactory.createForClass(TeamNameChangeEntity);

@Schema({ _id: false })
export class TeamOutcomeMvpEntity {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  kills!: number;
}
export const TeamOutcomeMvpSchema =
  SchemaFactory.createForClass(TeamOutcomeMvpEntity);

@Schema({ _id: false })
export class TeamOutcomeEntity {
  @Prop({ required: true })
  placement!: number;

  @Prop({ required: true })
  of!: number;

  @Prop()
  label?: string;

  @Prop({ required: true, default: false })
  champion!: boolean;

  @Prop({ min: 0 })
  wins?: number;

  @Prop({ min: 0 })
  losses?: number;

  @Prop({ min: 0 })
  draws?: number;

  @Prop({ type: TeamOutcomeMvpSchema })
  mvp?: TeamOutcomeMvpEntity;
}
export const TeamOutcomeSchema =
  SchemaFactory.createForClass(TeamOutcomeEntity);

export type TeamDocument = HydratedDocument<TeamEntity>;

@Schema({
  timestamps: true,
  collection: "leagueteams",
})
export class TeamEntity {
  @Prop({ required: true, unique: true, index: true, default: generateSlug })
  slug!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "DraftEntity", index: true })
  draftId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "CoachEntity" })
  primaryCoach?: Types.ObjectId;

  @Prop({ required: true })
  teamName!: string;

  @Prop()
  logo?: string;

  @Prop({
    type: String,
    enum: TEAM_STATUSES,
    default: "approved",
  })
  status!: TeamStatus;

  @Prop({ type: [[TeamPickSchema]], default: [] })
  picks!: TeamPickEntity[][];

  @Prop({ type: [PickLogSchema], default: [] })
  pickLog!: PickLogEntity[];

  @Prop({ default: 0 })
  skipCount!: number;

  @Prop({ type: [TeamNameChangeSchema], default: [] })
  nameHistory!: TeamNameChangeEntity[];

  @Prop({ type: TeamOutcomeSchema })
  outcome?: TeamOutcomeEntity;
}

export const TeamSchema = SchemaFactory.createForClass(TeamEntity);

TeamSchema.virtual("coaches", {
  ref: "CoachEntity",
  localField: "_id",
  foreignField: "teamId",
});
