import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PostChatMessageDto } from "./chat.dto";
import { ChatService } from "./chat.service";
import { ChatChannel } from "./chat.schema";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(":channel")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getMessages(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("channel") channel: ChatChannel,
    @Query("target") target?: string,
    @User() sub?: string,
  ) {
    return this.chatService.getMessages(
      leagueSlug,
      tournamentSlug,
      channel,
      target,
      sub,
    );
  }

  @Post(":channel")
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async postMessage(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("channel") channel: ChatChannel,
    @User() sub: string,
    @Body() body: PostChatMessageDto,
  ) {
    return this.chatService.postMessage(
      leagueSlug,
      tournamentSlug,
      channel,
      sub,
      body,
    );
  }

  @Delete("messages/:messageId")
  @UseGuards(JwtAuthGuard)
  async deleteMessage(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("messageId") messageId: string,
    @User() sub: string,
  ) {
    return this.chatService.deleteMessage(
      leagueSlug,
      tournamentSlug,
      messageId,
      sub,
    );
  }
}
