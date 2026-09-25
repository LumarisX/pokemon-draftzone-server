import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { TournamentScheduleService } from "./tournament-schedule.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/schedule")
export class TournamentScheduleController {
  constructor(private readonly scheduleService: TournamentScheduleService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getSchedule(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Query("teamSlug") teamSlug?: string | string[],
    @Query("round") round?: string,
    @User() sub?: string,
  ) {
    return this.scheduleService.getSchedule(leagueSlug, tournamentSlug, {
      teamSlug,
      roundFilter: round,
      sub,
    });
  }
}
