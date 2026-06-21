import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CreateStageDto,
  MakeTradeDto,
  SetCurrentRoundDto,
  SetStagePoolsDto,
  UpdateMatchupDto,
} from "./stage.dto";
import { StageService } from "./stage.service";

@Controller("leagues/:leagueKey/tournaments/:tournamentKey/stages")
@UseGuards(JwtAuthGuard)
export class StageController {
  constructor(private readonly stageService: StageService) {}

  @Post()
  async createStage(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: CreateStageDto,
  ) {
    return this.stageService.createStage(
      leagueKey,
      tournamentKey,
      sub,
      body,
    );
  }

  @Get(":stageId/schedule")
  async getSchedule(
    @Param("stageId") stageId: string,
    @Query("teamId") teamId?: string | string[],
    @Query("round") round?: string,
  ) {
    return this.stageService.getSchedule(stageId, teamId, round);
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

  @Post(":stageId/matchups/:matchupId")
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
