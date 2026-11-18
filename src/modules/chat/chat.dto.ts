import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CHAT_REPORT_REASON_MAX_LENGTH } from "./chat-report.schema";
import { CHAT_CHANNELS, CHAT_MESSAGE_MAX_LENGTH, ChatChannel } from "./chat.schema";

export const CHAT_REPORT_ACTIONS = ["dismiss", "remove"] as const;

export type ChatReportAction = (typeof CHAT_REPORT_ACTIONS)[number];

export class PostChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  text!: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  target?: string;
}

export class ChatChannelParamDto {
  @IsIn(CHAT_CHANNELS)
  channel!: ChatChannel;
}

export class ReportChatMessageDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_REPORT_REASON_MAX_LENGTH)
  reason!: string;
}

export class ResolveChatReportDto {
  @IsIn(CHAT_REPORT_ACTIONS)
  action!: ChatReportAction;
}
