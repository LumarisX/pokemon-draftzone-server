import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  SetMatchupAdvancementDto,
  SetMatchupNotesDto,
  SetMatchupScheduleDto,
  SubmitMatchupReportDto,
} from "./stage.dto";
import { StageService } from "./stage.service";

@Controller([
  "tournaments/:tournamentSlug/matchups",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/matchups",
])
export class TournamentMatchupController {
  constructor(private readonly stageService: StageService) {}

  @Get(":matchupSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getMatchupDetail(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupDetail(
      tournamentSlug,
      matchupSlug,
      sub,
    );
  }

  @Get(":matchupSlug/analysis")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getMatchupAnalysis(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupAnalysis(
      tournamentSlug,
      matchupSlug,
      sub,
    );
  }

  @Post(":matchupSlug/schedule")
  @UseGuards(JwtAuthGuard)
  async setMatchupSchedule(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupScheduleDto,
  ) {
    return this.stageService.setMatchupSchedule(
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/notes")
  @UseGuards(JwtAuthGuard)
  async setMatchupNotes(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupNotesDto,
  ) {
    return this.stageService.setMatchupNotes(
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/report")
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async submitMatchupReport(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SubmitMatchupReportDto,
  ) {
    return this.stageService.submitMatchupReport(
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/report/approve")
  @UseGuards(JwtAuthGuard)
  async approveMatchupReport(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      tournamentSlug,
      matchupSlug,
      sub,
      true,
    );
  }

  @Post(":matchupSlug/report/reject")
  @UseGuards(JwtAuthGuard)
  async rejectMatchupReport(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      tournamentSlug,
      matchupSlug,
      sub,
      false,
    );
  }

  @Post(":matchupSlug/advancement")
  @UseGuards(JwtAuthGuard)
  async setMatchupAdvancement(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupAdvancementDto,
  ) {
    return this.stageService.setMatchupAdvancement(
      tournamentSlug,
      matchupSlug,
      sub,
      body.advances,
    );
  }
}
