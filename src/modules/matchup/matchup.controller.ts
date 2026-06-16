import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MatchupService } from "./matchup.service";
import { match } from "assert";

@Controller("tournaments/:tournamentId/matchups")
@UseGuards(JwtAuthGuard)
export class MatchupController {
  constructor(private readonly matchupService: MatchupService) {}

  @Get()
  async getMatchups(@Param("tournamentId") tournamentId: string) {
    return this.matchupService.getByTournamentId(tournamentId);
  }

  @Get(":matchupId")
  async getMatchup(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
  ) {
    return this.matchupService.getMatchup(tournamentId, matchupId);
  }

  @Patch(":matchupId/score")
  async updateMatchupScore(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
  ) {}
}
