import { Controller, Get, Param } from "@nestjs/common";
import { LeagueService } from "./league.service";

@Controller("leagues")
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @Get(":leagueKey")
  async getLeague(@Param("leagueKey") leagueKey: string) {
    return this.leagueService.getLeagueSummary(leagueKey);
  }
}
