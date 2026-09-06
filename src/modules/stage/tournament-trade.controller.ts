import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MakeTradeDto, UpdateTradeDto } from "./stage.dto";
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
    @Query("teamSlug") teamSlug?: string | string[],
  ) {
    return this.tradeService.getTrades(leagueSlug, tournamentSlug, teamSlug);
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
  async updateTrade(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
    @Body() body: UpdateTradeDto,
  ) {
    return this.tradeService.updateTrade(
      leagueSlug,
      tournamentSlug,
      tradeId,
      sub,
      body,
    );
  }

  @Delete(":tradeId")
  @UseGuards(JwtAuthGuard)
  async withdrawTrade(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
  ) {
    return this.tradeService.withdrawTrade(
      leagueSlug,
      tournamentSlug,
      tradeId,
      sub,
    );
  }
}
