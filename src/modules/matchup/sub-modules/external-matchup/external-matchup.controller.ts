import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ExternalMatchupDto,
  SchedulePatchDto,
  ScorePatchDto,
} from "./external-matchup.dto";
import { ExternalMatchupService } from "./external-matchup.service";
import { ExternalMatchupMapper } from "./external-matchup.mapper";

@Controller("external/tournaments/:tournamentKey")
@UseGuards(JwtAuthGuard)
export class ExternalMatchupController {
  constructor(
    private readonly externalmatchupService: ExternalMatchupService,
  ) {}

  @Get("score")
  async getScore(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    const matchups = await this.externalmatchupService.getExternalMatchups(
      tournamentKey,
      sub,
    );
    return matchups.map(ExternalMatchupMapper.toClientPayload);
  }

  @Get("matchups")
  async getExternalMatchups(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    const matchups = await this.externalmatchupService.getExternalMatchups(
      tournamentKey,
      sub,
    );
    return matchups.map(ExternalMatchupMapper.toClientPayload);
  }

  @Post("matchups")
  async createExternalMatchup(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    await this.externalmatchupService.createExternalMatchup(
      tournamentKey,
      sub,
      body,
    );
    return { message: "ExternalMatchup Added" };
  }

  @Get("matchups/:matchupId")
  async getExternalMatchup(
    @Param("tournamentKey") tournamentKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    const matchup =
      await this.externalmatchupService.getExternalMatchup(matchupId);
    return ExternalMatchupMapper.toClientPayload(matchup);
  }

  @Get("matchups/:matchupId/opponent")
  async getExternalMatchupOpponent(
    @Param("tournamentKey") tournamentKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.externalmatchupService.getExternalMatchupOpponent(
      tournamentKey,
      matchupId,
      sub,
    );
  }

  @Patch("matchups/:matchupId/opponent")
  async updateExternalMatchupOpponent(
    @Param("tournamentKey") tournamentKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    const updatedMatchup =
      await this.externalmatchupService.updateExternalMatchupOpponent(
        matchupId,
        sub,
        body,
      );
    return {
      message: "ExternalMatchup Updated",
      draft: ExternalMatchupMapper.toClientPayload(updatedMatchup),
    };
  }

  @Patch("matchups/:matchupId/score")
  async updateExternalMatchupScore(
    @Param("tournamentKey") tournamentKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: ScorePatchDto,
  ) {
    await this.externalmatchupService.updateExternalMatchupScore(
      matchupId,
      body,
    );
    return { message: "Score Updated" };
  }

  @Get("matchups/:matchupId/schedule")
  async getExternalMatchupSchedule(
    @Param("tournamentKey") tournamentKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    return this.externalmatchupService.getExternalMatchupSchedule(matchupId);
  }

  @Patch("matchups/:matchupId/schedule")
  async updateExternalMatchupSchedule(
    @Param("tournamentKey") tournamentKey: string,
    @Param("externalmatchupId") matchupId: string,
    @User() sub: string,
    @Body() body: SchedulePatchDto,
  ) {
    await this.externalmatchupService.updateExternalMatchupSchedule(
      matchupId,
      body,
    );
    return { message: "Schedule Updated" };
  }
}
