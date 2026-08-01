import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MakeTradeDto, SetTradeStatusDto } from "./stage.dto";
import { TournamentTradeService } from "./tournament-trade.service";

/**
 * Trades at tournament level, where the round a trade takes effect in lives.
 *
 * The per-stage trade routes on `StageController` stay for tournaments the
 * sections-to-stages migration has not reached; they refuse once a tournament
 * owns its rounds (`STG-007`).
 */
@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/trades")
export class TournamentTradeController {
  constructor(private readonly tradeService: TournamentTradeService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTrades(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Query("teamId") teamId?: string | string[],
  ) {
    return this.tradeService.getTrades(leagueSlug, tournamentSlug, teamId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTrade(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.tradeService.createTrade(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Patch(":tradeId")
  @UseGuards(JwtAuthGuard)
  async setTradeStatus(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
    @Body() body: SetTradeStatusDto,
  ) {
    return this.tradeService.setTradeStatus(
      leagueSlug,
      tournamentSlug,
      tradeId,
      sub,
      body,
    );
  }
}
