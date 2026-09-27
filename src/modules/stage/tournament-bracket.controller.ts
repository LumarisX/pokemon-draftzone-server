import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { SetCurrentRoundDto } from "./stage.dto";
import { UpdateTournamentBracketDto } from "./tournament-bracket.dto";
import { TournamentBracketService } from "./tournament-bracket.service";

@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/bracket")
export class TournamentBracketController {
  constructor(private readonly bracketService: TournamentBracketService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub?: string,
  ) {
    return this.bracketService.getBracket(leagueSlug, tournamentSlug, sub);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async updateBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateTournamentBracketDto,
  ) {
    return this.bracketService.updateBracket(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Patch("current-round")
  @UseGuards(JwtAuthGuard)
  async setCurrentRound(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: SetCurrentRoundDto,
  ) {
    return this.bracketService.setCurrentRound(
      leagueSlug,
      tournamentSlug,
      sub,
      body.currentRoundIndex,
    );
  }
}
