import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CHAT_CHANNELS, CHAT_MESSAGE_MAX_LENGTH, ChatChannel } from "./chat.schema";

export class PostChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  text!: string;

  @IsString()
  @IsOptional()
  target?: string;
}

export class ChatChannelParamDto {
  @IsIn(CHAT_CHANNELS)
  channel!: ChatChannel;
}
