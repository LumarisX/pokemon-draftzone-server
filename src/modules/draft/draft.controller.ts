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

@Controller([
  "tournaments/:tournamentSlug/pools/:poolSlug",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/pools/:poolSlug",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/drafts/:poolSlug",
])
@UseGuards(JwtAuthGuard)
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  @Get()
  async getDetails(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.getDetails(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }

  @Get("teams")
  async getTeams(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Query("stageSlug") stageSlug?: string,
  ) {
    return this.draftService.getTeams(
      tournamentSlug,
      poolSlug,
      sub,
      stageSlug,
    );
  }

  @Get("picks")
  async getPicks(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.getPicks(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }

  @Get("order")
  async getOrder(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.getOrder(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }

  @Get("power-rankings")
  async getPowerRankings(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.getPowerRankings(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }

  @Post("teams/:teamId/draft")
  async draftPick(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: DraftDto,
  ) {
    return this.draftService.draftPick(
      tournamentSlug,
      poolSlug,
      teamId,
      sub,
      body,
    );
  }

  @Post("teams/:teamId/draft/rounds/:round")
  async setRoundPick(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @Param("teamId") teamId: string,
    @Param("round", ParseIntPipe) round: number,
    @User() sub: string,
    @Body() body: SetRoundPickDto,
  ) {
    return this.draftService.setRoundPick(
      tournamentSlug,
      poolSlug,
      teamId,
      round,
      sub,
      body,
    );
  }

  @Post("teams/:teamId/picks")
  async setPicks(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: SetPicksDto,
  ) {
    return this.draftService.setPicks(
      tournamentSlug,
      poolSlug,
      teamId,
      sub,
      body,
    );
  }

  @Post("state")
  async setState(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Body() body: SetDraftStateDto,
  ) {
    return this.draftService.setState(
      tournamentSlug,
      poolSlug,
      sub,
      body,
    );
  }

  @Post("timer")
  async setTimer(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Body() body: SetDraftTimerDto,
  ) {
    return this.draftService.setTimerMode(
      tournamentSlug,
      poolSlug,
      sub,
      body,
    );
  }

  @Post("settings")
  async updateSettings(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Body() body: UpdateDraftSettingsDto,
  ) {
    return this.draftService.updateSettings(
      tournamentSlug,
      poolSlug,
      sub,
      body,
    );
  }

  @Post("settings/test-message")
  async sendTestMessage(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.sendTestMessage(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }

  @Post("order")
  async setOrder(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Body() body: SetDraftOrderDto,
  ) {
    return this.draftService.setOrder(
      tournamentSlug,
      poolSlug,
      sub,
      body,
    );
  }

  @Post("current-pick")
  async setCurrentPick(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
    @Body() body: SetCurrentPickDto,
  ) {
    return this.draftService.setCurrentPick(
      tournamentSlug,
      poolSlug,
      sub,
      body,
    );
  }

  @Delete("teams/:teamId/draft/:pokemonId")
  async removeDraftPick(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @Param("teamId") teamId: string,
    @Param("pokemonId") pokemonId: string,
    @User() sub: string,
  ) {
    return this.draftService.removeDraftPick(
      tournamentSlug,
      poolSlug,
      teamId,
      sub,
      pokemonId,
    );
  }

  @Post("skip")
  async skipPick(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.skipPick(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }
}
