import { User } from "@core/decorators/user.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { ExternalTournamentDto } from "./external-tournament.dto";
import { ExternalTournamentService } from "./external-tournament.service";
import { ExternalTournamentMapper } from "./external-tournament.mapper";

@Controller("external/tournaments")
@UseGuards(JwtAuthGuard)
export class ExternalTournamentController {
  constructor(private readonly tournamentService: ExternalTournamentService) {}

  // @Get()
  // async getTournaments(@User() sub: string) {
  //   const tournaments = await this.tournamentService.getTournaments(sub);
  //   return {
  //     drafts: tournaments.map(ExternalTournamentMapper.toClientPayload),
  //     tournaments: [],
  //   };
  // }

  @Post()
  @HttpCode(201)
  async createTournament(
    @Body() body: ExternalTournamentDto,
    @User() sub: string,
  ) {
    const tournament = ExternalTournamentMapper.fromForm(body, sub);
    return this.tournamentService.createTournament(tournament);
  }

  @Get(":tournamentKey")
  async getTournament(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    const tournament = await this.tournamentService.getTournament(
      tournamentKey,
      sub,
    );
    return ExternalTournamentMapper.toClientPayload(tournament);
  }

  @Patch(":tournamentKey")
  async updateTournament(
    @Param("tournamentKey") tournamentKey: string,
    @Body() body: ExternalTournamentDto,
    @User() sub: string,
  ) {
    const tournament = ExternalTournamentMapper.fromForm(body, sub);
    const updated = await this.tournamentService.updateTournament(
      tournamentKey,
      sub,
      tournament,
    );
    return { message: "Tournament updated", tournament: updated };
  }

  @Delete(":tournamentKey")
  async deleteTournament(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    await this.tournamentService.deleteTournament(tournamentKey, sub);
    return { message: "Tournament deleted" };
  }

  @Get(":tournamentKey/stats")
  async getStats(
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    return await this.tournamentService.getTournamentStats(tournamentKey, sub);
  }
}
