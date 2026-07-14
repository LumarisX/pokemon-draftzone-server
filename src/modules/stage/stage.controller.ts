import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  UpdateMatchupDto,
} from "./stage.dto";
import { StageService } from "./stage.service";

@Controller("leagues/:leagueKey/tournaments/:tournamentKey/stages")
export class StageController {
  constructor(private readonly stageService: StageService) {}

  @Get()
  async listStages(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
  ) {
    return this.stageService.listStages(leagueKey, tournamentKey);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createStage(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: CreateStageDto,
  ) {
    return this.stageService.createStage(leagueKey, tournamentKey, sub, body);
  }

  @Get(":stageId/schedule")
  async getSchedule(
    @Param("stageId") stageId: string,
    @Query("teamId") teamId?: string | string[],
    @Query("round") round?: string,
  ) {
    return this.stageService.getSchedule(stageId, teamId, round);
  }

  @Get(":stageId/bracket")
  async getBracket(@Param("stageId") stageId: string) {
    return this.stageService.getBracket(stageId);
  }

  @Post(":stageId/bracket")
  @UseGuards(JwtAuthGuard)
  async generateBracket(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: GenerateBracketDto,
  ) {
    return this.stageService.generateBracket(
      leagueKey,
      tournamentKey,
      stageId,
      sub,
      body,
    );
  }

  @Delete(":stageId/bracket")
  @UseGuards(JwtAuthGuard)
  async deleteBracket(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
  ) {
    return this.stageService.deleteBracket(
      leagueKey,
      tournamentKey,
      stageId,
      sub,
    );
  }

  @Get(":stageId/standings")
  async getStandings(@Param("stageId") stageId: string) {
    return this.stageService.getStandings(stageId);
  }

  @Get(":stageId/trades")
  async getTrades(
    @Param("stageId") stageId: string,
    @Query("teamId") teamId?: string | string[],
  ) {
    return this.stageService.getTrades(stageId, teamId);
  }

  @Post(":stageId/trades")
  @UseGuards(JwtAuthGuard)
  async createTrade(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.stageService.createTrade(
      leagueKey,
      tournamentKey,
      stageId,
      sub,
      body,
    );
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":stageId/matchups/:matchupId")
  async getMatchupAnalysis(
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupAnalysis(stageId, matchupId, sub);
  }

  @Post(":stageId/matchups/:matchupId")
  @UseGuards(JwtAuthGuard)
  async updateMatchup(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: UpdateMatchupDto,
  ) {
    return this.stageService.updateMatchup(
      leagueKey,
      tournamentKey,
      stageId,
      matchupId,
      sub,
      body,
    );
  }

  @Post(":stageId/pools")
  @UseGuards(JwtAuthGuard)
  async setPools(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: SetStagePoolsDto,
  ) {
    return this.stageService.setPools(
      leagueKey,
      tournamentKey,
      stageId,
      sub,
      body,
    );
  }

  @Post(":stageId/current-round")
  @UseGuards(JwtAuthGuard)
  async advanceCurrentRound(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("stageId") stageId: string,
    @User() sub: string,
    @Body() body: SetCurrentRoundDto,
  ) {
    return this.stageService.advanceCurrentRound(
      leagueKey,
      tournamentKey,
      stageId,
      sub,
      body,
    );
  }
}
