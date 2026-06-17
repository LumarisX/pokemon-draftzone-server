import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { User } from "@core/decorators/user.decorator";
import { MatchupService } from "./matchup.service";
import { MatchupDto, ScorePatchDto, SchedulePatchDto } from "./matchup.dto";

@Controller("drafts/:tournamentId/matchups")
@UseGuards(JwtAuthGuard)
export class MatchupController {
  constructor(private readonly matchupService: MatchupService) {}

  @Get()
  async getMatchups(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
  ) {
    return this.matchupService.getMatchups(tournamentId, sub);
  }

  @Post()
  async createMatchup(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
    @Body() body: MatchupDto,
  ) {
    await this.matchupService.createMatchup(tournamentId, sub, body);
    return { message: "Matchup Added" };
  }

  @Get(":matchupId")
  async getMatchup(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.matchupService.getMatchup(tournamentId, matchupId, sub);
  }

  @Get(":matchupId/opponent")
  async getMatchupOpponent(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.matchupService.getMatchupOpponent(tournamentId, matchupId, sub);
  }

  @Patch(":matchupId/opponent")
  async updateMatchupOpponent(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: MatchupDto,
  ) {
    const updatedMatchup = await this.matchupService.updateMatchupOpponent(
      matchupId,
      sub,
      body,
    );
    return { message: "Matchup Updated", draft: updatedMatchup };
  }

  @Patch(":matchupId/score")
  async updateMatchupScore(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: ScorePatchDto,
  ) {}

  @Get(":matchupId/schedule")
  async getMatchupSchedule(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {}

  @Patch(":matchupId/schedule")
  async updateMatchupSchedule(
    @Param("tournamentId") tournamentId: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: SchedulePatchDto,
  ) {}
}
