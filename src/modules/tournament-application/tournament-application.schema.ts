import { HostedTournamentEntity } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export const TOURNAMENT_APPLICATION_STATUSES = [
  "pending",
  "waitlisted",
  "approved",
  "denied",
] as const;

export type TournamentApplicationStatus =
  (typeof TOURNAMENT_APPLICATION_STATUSES)[number];

export const TOURNAMENT_APPLICATION_INTENTS = ["team", "sub"] as const;

export type TournamentApplicationIntent =
  (typeof TOURNAMENT_APPLICATION_INTENTS)[number];

@Schema({ _id: false })
export class TournamentApplicationAnswerEntity {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ type: [String], default: [] })
  values!: string[];
}
export const TournamentApplicationAnswerSchema = SchemaFactory.createForClass(
  TournamentApplicationAnswerEntity,
);

export type TournamentApplicationDocument =
  HydratedDocument<TournamentApplicationEntity>;

@Schema({
  timestamps: true,
  collection: "tournamentapplications",
})
export class TournamentApplicationEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: HostedTournamentEntity.name,
    required: true,
    index: true,
  })
  tournamentId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  auth0Id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  gameName!: string;

  @Prop({ required: true })
  discordName!: string;

  @Prop({ required: true })
  timezone!: string;

  @Prop({ default: "" })
  experience!: string;

  @Prop({ default: false })
  droppedBefore!: boolean;

  @Prop()
  droppedWhy?: string;

  @Prop({ required: true, default: false })
  confirmed!: boolean;

  @Prop({ required: true })
  preferredTeamName!: string;

  @Prop()
  preferredLogo?: string;

  @Prop({
    type: String,
    enum: TOURNAMENT_APPLICATION_INTENTS,
    required: true,
    default: "team",
  })
  intent!: TournamentApplicationIntent;

  @Prop({
    type: String,
    enum: TOURNAMENT_APPLICATION_STATUSES,
    required: true,
    default: "pending",
  })
  status!: TournamentApplicationStatus;

  @Prop({ type: [TournamentApplicationAnswerSchema], default: [] })
  answers!: TournamentApplicationAnswerEntity[];

  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  joinTeamId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  resultingTeamId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "CoachEntity" })
  resultingCoachId?: Types.ObjectId;

  @Prop()
  decidedBy?: string;

  @Prop()
  decidedAt?: Date;

  @Prop({ default: () => new Date() })
  submittedAt!: Date;

  createdAt?: Date;
}

export const TournamentApplicationSchema = SchemaFactory.createForClass(
  TournamentApplicationEntity,
);

TournamentApplicationSchema.index(
  { tournamentId: 1, auth0Id: 1 },
  { unique: true },
);
TournamentApplicationSchema.index({ tournamentId: 1, status: 1 });
