import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  DraftDto,
  SetCurrentPickDto,
  SetDraftOrderDto,
  SetDraftStateDto,
  SetDraftTimerDto,
  SetPicksDto,
  SetRoundPickDto,
  UpdateDraftSettingsDto,
} from "./draft.dto";
import { DraftService } from "./draft.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/drafts/:draftSlug")
@UseGuards(JwtAuthGuard)
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  @Get()
  async getDetails(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.getDetails(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
    );
  }

  @Get("teams")
  async getTeams(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Query("stageSlug") stageSlug?: string,
  ) {
    return this.draftService.getTeams(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      stageSlug,
    );
  }

  @Get("picks")
  async getPicks(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
  ) {
    return this.draftService.getPicks(leagueSlug, tournamentSlug, draftSlug);
  }

  @Get("order")
  async getOrder(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
  ) {
    return this.draftService.getOrder(leagueSlug, tournamentSlug, draftSlug);
  }

  @Get("power-rankings")
  async getPowerRankings(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
  ) {
    return this.draftService.getPowerRankings(
      leagueSlug,
      tournamentSlug,
      draftSlug,
    );
  }

  @Get("pokemon-list")
  async getPokemonList(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Query("stageSlug") stageSlug?: string,
  ) {
    return this.draftService.getPokemonList(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      stageSlug,
    );
  }

  @Post("teams/:teamId/draft")
  async draftPick(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: DraftDto,
  ) {
    return this.draftService.draftPick(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      teamId,
      sub,
      body,
    );
  }

  @Post("teams/:teamId/draft/rounds/:round")
  async setRoundPick(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @Param("teamId") teamId: string,
    @Param("round", ParseIntPipe) round: number,
    @User() sub: string,
    @Body() body: SetRoundPickDto,
  ) {
    return this.draftService.setRoundPick(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      teamId,
      round,
      sub,
      body,
    );
  }

  @Post("teams/:teamId/picks")
  async setPicks(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: SetPicksDto,
  ) {
    return this.draftService.setPicks(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      teamId,
      sub,
      body,
    );
  }

  @Post("state")
  async setState(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Body() body: SetDraftStateDto,
  ) {
    return this.draftService.setState(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      body,
    );
  }

  @Post("timer")
  async setTimer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Body() body: SetDraftTimerDto,
  ) {
    return this.draftService.setTimerMode(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      body,
    );
  }

  @Post("settings")
  async updateSettings(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Body() body: UpdateDraftSettingsDto,
  ) {
    return this.draftService.updateSettings(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      body,
    );
  }

  @Post("settings/test-message")
  async sendTestMessage(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.sendTestMessage(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
    );
  }

  @Post("order")
  async setOrder(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Body() body: SetDraftOrderDto,
  ) {
    return this.draftService.setOrder(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      body,
    );
  }

  @Post("current-pick")
  async setCurrentPick(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
    @Body() body: SetCurrentPickDto,
  ) {
    return this.draftService.setCurrentPick(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
      body,
    );
  }

  @Delete("teams/:teamId/draft/:pokemonId")
  async removeDraftPick(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @Param("teamId") teamId: string,
    @Param("pokemonId") pokemonId: string,
    @User() sub: string,
  ) {
    return this.draftService.removeDraftPick(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      teamId,
      sub,
      pokemonId,
    );
  }

  @Post("skip")
  async skipPick(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("draftSlug") draftSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.skipPick(
      leagueSlug,
      tournamentSlug,
      draftSlug,
      sub,
    );
  }
}
