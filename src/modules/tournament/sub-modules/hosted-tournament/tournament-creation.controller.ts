import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateTournamentDto } from "./hosted-tournament.dto";
import { TournamentCreationService } from "./tournament-creation.service";

@Controller("leagues/:leagueSlug/tournaments")
export class TournamentCreationController {
  constructor(private readonly creation: TournamentCreationService) {}

  @Post()
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60 * 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  async createTournament(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string,
    @Body() body: CreateTournamentDto,
  ) {
    return this.creation.createTournament(leagueSlug, sub, body);
  }
}
