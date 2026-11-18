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
import { ChatReportService } from "./chat-report.service";
import {
  PostChatMessageDto,
  ReportChatMessageDto,
  ResolveChatReportDto,
} from "./chat.dto";
import { ChatService } from "./chat.service";
import { ChatChannel } from "./chat.schema";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/chat")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly reportService: ChatReportService,
  ) {}

  @Get("reports")
  @UseGuards(JwtAuthGuard)
  async getReports(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.reportService.listForTournament(
      leagueSlug,
      tournamentSlug,
      sub,
    );
  }

  @Post("reports/:reportId/resolve")
  @UseGuards(JwtAuthGuard)
  async resolveReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("reportId") reportId: string,
    @User() sub: string,
    @Body() body: ResolveChatReportDto,
  ) {
    return this.reportService.resolveForTournament(
      leagueSlug,
      tournamentSlug,
      reportId,
      sub,
      body.action,
    );
  }

  @Post("messages/:messageId/report")
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  async reportMessage(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("messageId") messageId: string,
    @User() sub: string,
    @Body() body: ReportChatMessageDto,
  ) {
    return this.reportService.report(
      leagueSlug,
      tournamentSlug,
      messageId,
      sub,
      body,
    );
  }

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
