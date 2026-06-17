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

@Controller("tournaments/external/:tournamentId/matchups")
@UseGuards(JwtAuthGuard)
export class ExternalMatchupController {
  constructor(
    private readonly externalmatchupService: ExternalMatchupService,
  ) {}

  @Get()
  async getExternalMatchups(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
  ) {
    return this.externalmatchupService.getExternalMatchups(tournamentId, sub);
  }

  @Post()
  async createExternalMatchup(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    await this.externalmatchupService.createExternalMatchup(
      tournamentId,
      sub,
      body,
    );
    return { message: "ExternalMatchup Added" };
  }

  @Get(":externalmatchupId")
  async getExternalMatchup(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
  ) {
    return this.externalmatchupService.getExternalMatchup(
      tournamentId,
      externalmatchupId,
      sub,
    );
  }

  @Get(":externalmatchupId/opponent")
  async getExternalMatchupOpponent(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
  ) {
    return this.externalmatchupService.getExternalMatchupOpponent(
      tournamentId,
      externalmatchupId,
      sub,
    );
  }

  @Patch(":externalmatchupId/opponent")
  async updateExternalMatchupOpponent(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    const updatedExternalMatchup =
      await this.externalmatchupService.updateExternalMatchupOpponent(
        externalmatchupId,
        sub,
        body,
      );
    return {
      message: "ExternalMatchup Updated",
      draft: updatedExternalMatchup,
    };
  }

  @Patch(":externalmatchupId/score")
  async updateExternalMatchupScore(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
    @Body() body: ScorePatchDto,
  ) {}

  @Get(":externalmatchupId/schedule")
  async getExternalMatchupSchedule(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
  ) {}

  @Patch(":externalmatchupId/schedule")
  async updateExternalMatchupSchedule(
    @Param("tournamentId") tournamentId: string,
    @Param("externalmatchupId") externalmatchupId: string,
    @User() sub: string,
    @Body() body: SchedulePatchDto,
  ) {}
}
