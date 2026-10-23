import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  AttachTierListDto,
  cleanResolutions,
  PullTierListDto,
  SaveAsPresetDto,
  SwapPreviewDto,
} from "./tournament-tier-list.dto";
import { TournamentTierListService } from "./tournament-tier-list.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/tier-list")
@UseGuards(JwtAuthGuard)
export class TournamentTierListController {
  constructor(private readonly service: TournamentTierListService) {}

  @Get("preview")
  async preview(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Query() query: SwapPreviewDto,
  ) {
    return this.service.preview(leagueSlug, tournamentSlug, sub, query.from);
  }

  @Post("attach")
  async attach(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AttachTierListDto,
  ) {
    return this.service.attach(leagueSlug, tournamentSlug, sub, body);
  }

  @Get("source")
  async source(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.service.sourceStatus(leagueSlug, tournamentSlug, sub);
  }

  @Post("pull")
  async pull(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: PullTierListDto,
  ) {
    return this.service.pull(leagueSlug, tournamentSlug, sub, {
      version: body.version,
      resolutions: cleanResolutions(body.resolutions),
      reason: body.reason,
    });
  }

  @Post("save-as-preset")
  async saveAsPreset(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: SaveAsPresetDto,
  ) {
    return this.service.saveAsPreset(leagueSlug, tournamentSlug, sub, body);
  }
}
