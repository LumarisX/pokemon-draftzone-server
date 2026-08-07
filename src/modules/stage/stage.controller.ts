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
  UpdateBracketDto,
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

  @Patch(":stageSlug")
  @UseGuards(JwtAuthGuard)
  async setVisibility(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: UpdateStageDto,
  ) {
    return this.stageService.setVisibility(
      leagueSlug,
      tournamentSlug,
      stageSlug,
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

  @Get(":stageSlug/schedule")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getSchedule(
    @Param("stageSlug") stageSlug: string,
    @Query("teamId") teamId?: string | string[],
    @Query("round") round?: string,
    @User() sub?: string,
  ) {
    return this.stageService.getSchedule(stageSlug, teamId, round, sub);
  }

  @Get(":stageSlug/bracket")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getBracket(
    @Param("stageSlug") stageSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getBracket(stageSlug, sub);
  }

  @Post(":stageSlug/bracket")
  @UseGuards(JwtAuthGuard)
  async generateBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: GenerateBracketDto,
  ) {
    return this.stageService.generateBracket(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
      body,
    );
  }

  /**
   * Applies an edited bracket to a stage that may already be under way.
   * Unlike POST, this neither refuses an existing bracket nor rebuilds it —
   * see `StageService.updateBracket`.
   */
  @Patch(":stageSlug/bracket")
  @UseGuards(JwtAuthGuard)
  async updateBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: UpdateBracketDto,
  ) {
    return this.stageService.updateBracket(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
      body,
    );
  }

  @Delete(":stageSlug/bracket")
  @UseGuards(JwtAuthGuard)
  async deleteBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
  ) {
    return this.stageService.deleteBracket(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
    );
  }

  @Get(":stageSlug/standings")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getStandings(
    @Param("stageSlug") stageSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getStandings(stageSlug, sub);
  }

  @Get(":stageSlug/trades")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTrades(
    @Param("stageSlug") stageSlug: string,
    @Query("teamId") teamId?: string | string[],
    @User() sub?: string,
  ) {
    return this.stageService.getTrades(stageSlug, teamId, sub);
  }

  @Post(":stageSlug/trades")
  @UseGuards(JwtAuthGuard)
  async createTrade(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.stageService.createTrade(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
      body,
    );
  }

  @Patch(":stageSlug/trades/:tradeId")
  @UseGuards(JwtAuthGuard)
  async setTradeStatus(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @Param("tradeId") tradeId: string,
    @User() sub: string,
    @Body() body: SetTradeStatusDto,
  ) {
    return this.stageService.setTradeStatus(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      tradeId,
      sub,
      body,
    );
  }

  @Post(":stageSlug/pools")
  @UseGuards(JwtAuthGuard)
  async setPools(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: SetStagePoolsDto,
  ) {
    return this.stageService.setPools(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
      body,
    );
  }

  @Post(":stageSlug/current-round")
  @UseGuards(JwtAuthGuard)
  async advanceCurrentRound(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("stageSlug") stageSlug: string,
    @User() sub: string,
    @Body() body: SetCurrentRoundDto,
  ) {
    return this.stageService.advanceCurrentRound(
      leagueSlug,
      tournamentSlug,
      stageSlug,
      sub,
      body,
    );
  }
}
