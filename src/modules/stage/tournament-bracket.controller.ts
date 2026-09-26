import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { SetCurrentRoundDto } from "./stage.dto";
import { UpdateTournamentBracketDto } from "./tournament-bracket.dto";
import { TournamentBracketService } from "./tournament-bracket.service";

@Controller([
  "tournaments/:tournamentSlug/bracket",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/bracket",
])
export class TournamentBracketController {
  constructor(private readonly bracketService: TournamentBracketService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getBracket(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub?: string,
  ) {
    return this.bracketService.getBracket(tournamentSlug, sub);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async updateBracket(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateTournamentBracketDto,
  ) {
    return this.bracketService.updateBracket(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Patch("current-round")
  @UseGuards(JwtAuthGuard)
  async setCurrentRound(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: SetCurrentRoundDto,
  ) {
    return this.bracketService.setCurrentRound(
      tournamentSlug,
      sub,
      body.currentRoundIndex,
    );
  }
}
