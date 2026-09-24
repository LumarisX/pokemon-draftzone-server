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
} from "./stage.dto";
import { StageService } from "./stage.service";

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
}
