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
import {
  CreateStageDto,
  GenerateBracketDto,
  MakeTradeDto,
  SetCurrentRoundDto,
  SetStagePoolsDto,
  SetTradeStatusDto,
  SubmitMatchupReportDto,
  UpdateBracketDto,
  UpdateMatchupDto,
  UpdateStageDto,
} from "./stage.dto";
import { StageService } from "./stage.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/stages")
export class StageController {
  constructor(private readonly stageService: StageService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async listStages(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.listStages(leagueSlug, tournamentSlug, sub);
  }

  @Patch(":stageId")
  @UseGuards(JwtAuthGuard)
  async setVisibility(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: UpdateStageDto,
  ) {
    return this.stageService.setVisibility(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createStage(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: CreateStageDto,
  ) {
    return this.stageService.createStage(leagueSlug, tournamentSlug, sub, body);
  }

  @Get(":stageId/schedule")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getSchedule(
    @Param("stageId") stageId: string,
    @Query("teamId") teamId?: string | string[],
    @Query("round") round?: string,
    @User() sub?: string,
  ) {
    return this.stageService.getSchedule(stageId, teamId, round, sub);
  }

  @Get(":stageId/bracket")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getBracket(@Param("stageId") stageId: string, @User() sub?: string) {
    return this.stageService.getBracket(stageId, sub);
  }

  @Post(":stageId/bracket")
  @UseGuards(JwtAuthGuard)
  async generateBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: GenerateBracketDto,
  ) {
    return this.stageService.generateBracket(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }

  /**
   * Applies an edited bracket to a stage that may already be under way.
   * Unlike POST, this neither refuses an existing bracket nor rebuilds it —
   * see `StageService.updateBracket`.
   */
  @Patch(":stageId/bracket")
  @UseGuards(JwtAuthGuard)
  async updateBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: UpdateBracketDto,
  ) {
    return this.stageService.updateBracket(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }

  @Delete(":stageId/bracket")
  @UseGuards(JwtAuthGuard)
  async deleteBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
  ) {
    return this.stageService.deleteBracket(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
    );
  }

  @Get(":stageId/standings")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getStandings(@Param("stageId") stageId: string, @User() sub?: string) {
    return this.stageService.getStandings(stageId, sub);
  }

  @Get(":stageId/trades")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTrades(
    @Param("stageId") stageId: string,
    @Query("teamId") teamId?: string | string[],
    @User() sub?: string,
  ) {
    return this.stageService.getTrades(stageId, teamId, sub);
  }

  @Post(":stageId/trades")
  @UseGuards(JwtAuthGuard)
  async createTrade(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.stageService.createTrade(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }

  @Patch(":stageId/trades/:tradeId")
  @UseGuards(JwtAuthGuard)
  async setTradeStatus(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
    @Body() body: SetTradeStatusDto,
  ) {
    return this.stageService.setTradeStatus(
      leagueSlug,
      tournamentSlug,
      stageId,
      tradeId,
      sub,
      body,
    );
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":stageId/matchups/:matchupId")
  async getMatchupDetail(
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupDetail(stageId, matchupId, sub);
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":stageId/matchups/:matchupId/analysis")
  async getMatchupAnalysis(
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupAnalysis(stageId, matchupId, sub);
  }

  @Post(":stageId/matchups/:matchupId/report")
  @UseGuards(JwtAuthGuard)
  async submitMatchupReport(
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: SubmitMatchupReportDto,
  ) {
    return this.stageService.submitMatchupReport(
      stageId,
      matchupId,
      sub,
      body,
    );
  }

  @Post(":stageId/matchups/:matchupId/report/approve")
  @UseGuards(JwtAuthGuard)
  async approveMatchupReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      leagueSlug,
      tournamentSlug,
      stageId,
      matchupId,
      sub,
      true,
    );
  }

  @Post(":stageId/matchups/:matchupId/report/reject")
  @UseGuards(JwtAuthGuard)
  async rejectMatchupReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      leagueSlug,
      tournamentSlug,
      stageId,
      matchupId,
      sub,
      false,
    );
  }

  @Post(":stageId/matchups/:matchupId")
  @UseGuards(JwtAuthGuard)
  async updateMatchup(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: UpdateMatchupDto,
  ) {
    return this.stageService.updateMatchup(
      leagueSlug,
      tournamentSlug,
      stageId,
      matchupId,
      sub,
      body,
    );
  }

  @Post(":stageId/pools")
  @UseGuards(JwtAuthGuard)
  async setPools(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: SetStagePoolsDto,
  ) {
    return this.stageService.setPools(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }

  @Post(":stageId/current-round")
  @UseGuards(JwtAuthGuard)
  async advanceCurrentRound(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: SetCurrentRoundDto,
  ) {
    return this.stageService.advanceCurrentRound(
      leagueSlug,
      tournamentSlug,
      stageId,
      sub,
      body,
    );
  }
}
