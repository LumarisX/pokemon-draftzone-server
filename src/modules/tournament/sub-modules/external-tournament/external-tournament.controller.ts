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

  @Get()
  async getTournaments(@User() sub: string) {
    const tournaments = await this.tournamentService.getTournaments(sub);
    return {
      drafts: tournaments.map(ExternalTournamentMapper.toClientPayload),
    };
  }

  @Post()
  @HttpCode(201)
  async createTournament(
    @Body() body: ExternalTournamentDto,
    @User() sub: string,
  ) {
    const tournament = ExternalTournamentMapper.fromForm(body, sub);
    return this.tournamentService.createTournament(tournament);
  }

  @Get(":tournamentSlug")
  async getTournament(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    const tournament = await this.tournamentService.getTournament(
      tournamentSlug,
      sub,
    );
    return ExternalTournamentMapper.toClientPayload(tournament);
  }

  @Patch(":tournamentSlug")
  async updateTournament(
    @Param("tournamentSlug") tournamentSlug: string,
    @Body() body: ExternalTournamentDto,
    @User() sub: string,
  ) {
    const tournament = ExternalTournamentMapper.fromForm(
      body,
      sub,
      tournamentSlug,
    );
    const updated = await this.tournamentService.updateTournament(
      tournamentSlug,
      sub,
      tournament,
    );
    return { message: "Tournament updated", tournament: updated };
  }

  @Delete(":tournamentSlug")
  async deleteTournament(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    await this.tournamentService.deleteTournament(tournamentSlug, sub);
    return { message: "Tournament deleted" };
  }

  @Post(":tournamentSlug/archive")
  @HttpCode(200)
  async archiveTournament(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    await this.tournamentService.archiveTournament(tournamentSlug, sub);
    return { message: "Tournament archived" };
  }

  @Delete(":tournamentSlug/archive")
  async unarchiveTournament(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    await this.tournamentService.unarchiveTournament(tournamentSlug, sub);
    return { message: "Tournament restored" };
  }

  @Get(":tournamentSlug/stats")
  async getStats(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return await this.tournamentService.getTournamentStats(tournamentSlug, sub);
  }
}
