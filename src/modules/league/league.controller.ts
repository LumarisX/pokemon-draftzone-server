import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LeagueService } from "./league.service";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { CreateLeagueDto } from "./league.dto";

@Controller("leagues")
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getLeagues(@User() sub: string) {
    return this.leagueService.getLeagues(sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60 * 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  async createLeague(@User() sub: string, @Body() body: CreateLeagueDto) {
    return this.leagueService.createLeague(sub, body);
  }

  @Get("capabilities")
  @UseGuards(JwtAuthGuard)
  async getCapabilities(@User() sub: string) {
    return this.leagueService.getCapabilities(sub);
  }

  @Get("owned")
  @UseGuards(JwtAuthGuard)
  async getOwnedLeagues(@User() sub: string) {
    return this.leagueService.getOwnedLeagues(sub);
  }

  @Get(":leagueSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getLeague(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.leagueService.getLeagueSummary(leagueSlug, sub);
  }
}
