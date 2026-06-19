import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Types } from "mongoose";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";
import { OptionalAuth } from "@modules/auth/optional-auth.dectorator";

@Controller("external/matchups")
export class ExternalMatchupBreakdownController {
  constructor(
    private readonly matchupBreakdownService: ExternalMatchupBreakdownService,
  ) {}

  @Post("quick")
  async analyzeQuickMatchup(@Body() quickData: any) {
    const matchup =
      await this.matchupBreakdownService.createQuickMatchup(quickData);
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":matchupId")
  async getAnalyzedMatchup(@Param("matchupId") matchupId: Types.ObjectId) {
    const matchup =
      await this.matchupBreakdownService.getMatchupById(matchupId);
    return matchup.analyze();
  }
}
