import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { TournamentDiscordService } from "./tournament-discord.service";

@Controller([
  "tournaments/:tournamentSlug/discord",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/discord",
])
@UseGuards(JwtAuthGuard)
export class TournamentDiscordController {
  constructor(private readonly discordLink: TournamentDiscordService) {}

  @Post("link-code")
  @HttpCode(HttpStatus.CREATED)
  async createLinkCode(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.discordLink.createLinkCode(tournamentSlug, sub);
  }

  @Delete("link")
  async unlink(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.discordLink.unlink(tournamentSlug, sub);
  }
}
