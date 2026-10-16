import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { DraftService } from "./draft.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/draft-overview")
export class DraftOverviewController {
  constructor(private readonly draftService: DraftService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async get(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.draftService.getOverview(leagueSlug, tournamentSlug, sub);
  }
}
