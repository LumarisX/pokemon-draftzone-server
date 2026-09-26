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

@Controller([
  "tournaments/:tournamentSlug/trades",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/trades",
])
export class TournamentTradeController {
  constructor(private readonly tradeService: TournamentTradeService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTrades(
    @Param("tournamentSlug") tournamentSlug: string,
    @Query("teamSlug") teamSlug?: string | string[],
  ) {
    return this.tradeService.getTrades(tournamentSlug, teamSlug);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTrade(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.tradeService.createTrade(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Patch(":tradeId")
  @UseGuards(JwtAuthGuard)
  async updateTrade(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
    @Body() body: UpdateTradeDto,
  ) {
    return this.tradeService.updateTrade(
      tournamentSlug,
      tradeId,
      sub,
      body,
    );
  }

  @Delete(":tradeId")
  @UseGuards(JwtAuthGuard)
  async withdrawTrade(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
  ) {
    return this.tradeService.withdrawTrade(
      tournamentSlug,
      tradeId,
      sub,
    );
  }
}
