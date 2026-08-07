import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export const CHAT_CHANNELS = [
  "tournament",
  "matchup",
  "draft",
  "spectator",
] as const;

export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export const CHAT_AUTHOR_ROLES = ["organizer", "coach", "spectator"] as const;

export type ChatAuthorRole = (typeof CHAT_AUTHOR_ROLES)[number];

export const CHAT_MESSAGE_MAX_LENGTH = 1000;

export type TournamentMessageDocument =
  HydratedDocument<TournamentMessageEntity>;

@Schema({
  timestamps: true,
  collection: "tournamentmessages",
})
export class TournamentMessageEntity {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  tournament!: Types.ObjectId;

  @Prop({ type: String, enum: CHAT_CHANNELS, required: true })
  channel!: ChatChannel;

  @Prop({ default: "" })
  target!: string;

  @Prop({ required: true })
  author!: string;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ type: String, enum: CHAT_AUTHOR_ROLES, required: true })
  authorRole!: ChatAuthorRole;

  @Prop({ type: SchemaTypes.ObjectId, ref: "TeamEntity" })
  team?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: CHAT_MESSAGE_MAX_LENGTH })
  text!: string;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedBy?: string;

  createdAt!: Date;
}

export const TournamentMessageSchema = SchemaFactory.createForClass(
  TournamentMessageEntity,
);

TournamentMessageSchema.index({
  tournament: 1,
  channel: 1,
  target: 1,
  createdAt: 1,
});
