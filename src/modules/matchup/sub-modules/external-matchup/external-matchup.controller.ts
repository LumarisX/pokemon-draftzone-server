import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ExternalMatchupDto, ScorePatchDto } from "./external-matchup.dto";
import { ExternalMatchupService } from "./external-matchup.service";
import { ExternalMatchupMapper } from "./external-matchup.mapper";

@Controller("external/tournaments/:tournamentSlug")
@UseGuards(JwtAuthGuard)
export class ExternalMatchupController {
  constructor(
    private readonly externalmatchupService: ExternalMatchupService,
  ) {}

  @Get("score")
  async getScore(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    const matchups = await this.externalmatchupService.getExternalMatchups(
      tournamentSlug,
      sub,
    );
    return matchups.map(ExternalMatchupMapper.toClientPayload);
  }

  @Get("matchups")
  async getExternalMatchups(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    const matchups = await this.externalmatchupService.getExternalMatchups(
      tournamentSlug,
      sub,
    );
    return matchups.map(ExternalMatchupMapper.toClientPayload);
  }

  @Post("matchups")
  async createExternalMatchup(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    await this.externalmatchupService.createExternalMatchup(
      tournamentSlug,
      sub,
      body,
    );
    return { message: "ExternalMatchup Added" };
  }

  @Get("matchups/:matchupId")
  async getExternalMatchup(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    const matchup = await this.externalmatchupService.getExternalMatchup(
      tournamentSlug,
      matchupId,
      sub,
    );
    return ExternalMatchupMapper.toScorePayload(matchup);
  }

  @Get("matchups/:matchupId/opponent")
  async getExternalMatchupOpponent(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    const matchup =
      await this.externalmatchupService.getExternalMatchupOpponent(
        tournamentSlug,
        matchupId,
        sub,
      );
    return ExternalMatchupMapper.toClientPayload(matchup);
  }

  @Patch("matchups/:matchupId/opponent")
  async updateExternalMatchupOpponent(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: ExternalMatchupDto,
  ) {
    const updatedMatchup =
      await this.externalmatchupService.updateExternalMatchupOpponent(
        tournamentSlug,
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
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: ScorePatchDto,
  ) {
    await this.externalmatchupService.updateExternalMatchupScore(
      tournamentSlug,
      matchupId,
      sub,
      body,
    );
    return { message: "Score Updated" };
  }

  @Delete("matchups/:matchupId")
  async deleteExternalMatchup(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
  ) {
    await this.externalmatchupService.deleteExternalMatchup(
      tournamentSlug,
      matchupId,
      sub,
    );
    return { message: "ExternalMatchup Deleted" };
  }
}
