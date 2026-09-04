import { User } from "@core/decorators/user.decorator";
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
import {
  SetMatchupAdvancementDto,
  SetMatchupNotesDto,
  SetMatchupScheduleDto,
  SubmitMatchupReportDto,
  UpdateMatchupDto,
} from "./stage.dto";
import { StageService } from "./stage.service";

/**
 * A single match, addressed at tournament level.
 *
 * The stage segment these routes used to carry was never doing any work: a
 * matchup slug is unique across the collection, and rounds and stages both
 * belong to the tournament, so the tournament is the smallest scope that
 * actually contains a match. Which stage it sits in is something the service
 * reads off the matchup — and checks against the tournament in the URL.
 */
@Controller("leagues/:leagueSlug/tournaments/:tournamentSlug/matchups")
export class TournamentMatchupController {
  constructor(private readonly stageService: StageService) {}

  @Get(":matchupSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getMatchupDetail(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupDetail(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
  }

  @Get(":matchupSlug/analysis")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getMatchupAnalysis(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub?: string,
  ) {
    return this.stageService.getMatchupAnalysis(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
  }

  @Post(":matchupSlug/schedule")
  @UseGuards(JwtAuthGuard)
  async setMatchupSchedule(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupScheduleDto,
  ) {
    return this.stageService.setMatchupSchedule(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/notes")
  @UseGuards(JwtAuthGuard)
  async setMatchupNotes(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupNotesDto,
  ) {
    return this.stageService.setMatchupNotes(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/report")
  @UseGuards(JwtAuthGuard)
  async submitMatchupReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SubmitMatchupReportDto,
  ) {
    return this.stageService.submitMatchupReport(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }

  @Post(":matchupSlug/report/approve")
  @UseGuards(JwtAuthGuard)
  async approveMatchupReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      true,
    );
  }

  @Post(":matchupSlug/report/reject")
  @UseGuards(JwtAuthGuard)
  async rejectMatchupReport(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
  ) {
    return this.stageService.reviewMatchupReport(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      false,
    );
  }

  /**
   * Unsticks a bracket that a result could not resolve.
   *
   * Its own route rather than a field on the result: the advancement is a
   * separate decision from the score, is made after the fact, and must not
   * require resending a result to change.
   */
  @Post(":matchupSlug/advancement")
  @UseGuards(JwtAuthGuard)
  async setMatchupAdvancement(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: SetMatchupAdvancementDto,
  ) {
    return this.stageService.setMatchupAdvancement(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      body.advances,
    );
  }

  @Post(":matchupSlug")
  @UseGuards(JwtAuthGuard)
  async updateMatchup(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupSlug") matchupSlug: string,
    @User() sub: string,
    @Body() body: UpdateMatchupDto,
  ) {
    return this.stageService.updateMatchup(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
      body,
    );
  }
}
