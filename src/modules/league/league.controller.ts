import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { LeagueService } from "./league.service";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { User } from "@core/decorators/user.decorator";

@Controller("leagues")
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getLeagues(@User() sub: string) {
    return this.leagueService.getLeagues(sub);
  }

  @Get(":leagueSlug")
  async getLeague(@Param("leagueSlug") leagueSlug: string) {
    return this.leagueService.getLeagueSummary(leagueSlug);
  }
}
