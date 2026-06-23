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
import { DraftPickDto, SetDraftStateDto, SetPicksDto } from "./draft.dto";
import { DraftService } from "./draft.service";

@Controller("leagues/:leagueKey/tournaments/:tournamentKey/drafts/:draftKey")
@UseGuards(JwtAuthGuard)
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  @Get()
  async getDetails(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @User() sub: string,
  ) {
    return this.draftService.getDetails(
      leagueKey,
      tournamentKey,
      draftKey,
      sub,
    );
  }

  @Get("teams")
  async getTeams(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @User() sub: string,
    @Query("stageId") stageId?: string,
  ) {
    return this.draftService.getTeams(
      leagueKey,
      tournamentKey,
      draftKey,
      sub,
      stageId,
    );
  }

  @Get("picks")
  async getPicks(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
  ) {
    return this.draftService.getPicks(leagueKey, tournamentKey, draftKey);
  }

  @Get("order")
  async getOrder(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
  ) {
    return this.draftService.getOrder(leagueKey, tournamentKey, draftKey);
  }

  @Get("power-rankings")
  async getPowerRankings(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
  ) {
    return this.draftService.getPowerRankings(
      leagueKey,
      tournamentKey,
      draftKey,
    );
  }

  @Get("pokemon-list")
  async getPokemonList(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @User() sub: string,
    @Query("stageId") stageId?: string,
  ) {
    return this.draftService.getPokemonList(
      leagueKey,
      tournamentKey,
      draftKey,
      sub,
      stageId,
    );
  }

  @Post("teams/:teamId/draft")
  async draftPick(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: DraftPickDto,
  ) {
    return this.draftService.draftPick(
      leagueKey,
      tournamentKey,
      draftKey,
      teamId,
      sub,
      body,
    );
  }

  @Post("teams/:teamId/picks")
  async setPicks(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: SetPicksDto,
  ) {
    return this.draftService.setPicks(
      leagueKey,
      tournamentKey,
      draftKey,
      teamId,
      sub,
      body,
    );
  }

  @Post("state")
  async setState(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @User() sub: string,
    @Body() body: SetDraftStateDto,
  ) {
    return this.draftService.setState(
      leagueKey,
      tournamentKey,
      draftKey,
      sub,
      body,
    );
  }

  @Post("skip")
  async skipPick(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("draftKey") draftKey: string,
    @User() sub: string,
  ) {
    return this.draftService.skipPick(leagueKey, tournamentKey, draftKey, sub);
  }
}
