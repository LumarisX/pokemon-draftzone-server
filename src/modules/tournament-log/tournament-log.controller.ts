import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { LogQueryDto } from "./tournament-log.dto";
import { TournamentLogService } from "./tournament-log.service";

@Controller("leagues/:leagueSlug/tournaments")
export class TournamentLogController {
  constructor(private readonly logService: TournamentLogService) {}

  @Get(":tournamentSlug/log")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getLog(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
    @Query() query: LogQueryDto,
  ) {
    return this.logService.list(leagueSlug, tournamentSlug, sub, {
      types: query.types?.split(",").filter(Boolean),
      before: query.before,
      limit: query.limit,
    });
  }
}
