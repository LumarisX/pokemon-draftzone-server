import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
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
}
