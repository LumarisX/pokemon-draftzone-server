import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { CHAT_CHANNELS, ChatChannel } from "./chat.schema";

export const CHAT_REPORT_STATUSES = ["open", "dismissed", "removed"] as const;

export type ChatReportStatus = (typeof CHAT_REPORT_STATUSES)[number];

export const CHAT_REPORT_REASON_MAX_LENGTH = 300;

export type ChatReportDocument = HydratedDocument<ChatReportEntity>;

@Schema({ timestamps: true, collection: "chatreports" })
export class ChatReportEntity {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  message!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  tournament!: Types.ObjectId;

  @Prop({ type: String, enum: CHAT_CHANNELS, required: true })
  channel!: ChatChannel;

  @Prop({ type: String, default: "" })
  target!: string;

  @Prop({ type: String, required: true })
  reporter!: string;

  @Prop({ type: String, required: true })
  reporterName!: string;

  @Prop({ type: String, required: true, maxlength: CHAT_REPORT_REASON_MAX_LENGTH })
  reason!: string;

  @Prop({ type: String, required: true })
  messageText!: string;

  @Prop({ type: String, required: true })
  messageAuthor!: string;

  @Prop({ type: String, required: true })
  messageAuthorName!: string;

  @Prop({ type: Boolean, default: false })
  escalated!: boolean;

  @Prop({ type: String, enum: CHAT_REPORT_STATUSES, default: "open" })
  status!: ChatReportStatus;

  @Prop({ type: String })
  resolvedBy?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  createdAt!: Date;
}

export const ChatReportSchema = SchemaFactory.createForClass(ChatReportEntity);

ChatReportSchema.index(
  { message: 1, reporter: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);
ChatReportSchema.index({ tournament: 1, status: 1, escalated: 1, createdAt: -1 });
ChatReportSchema.index({ status: 1, escalated: 1, createdAt: -1 });
ChatReportSchema.index({ message: 1, status: 1 });
