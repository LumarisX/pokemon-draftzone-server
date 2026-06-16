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
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TournamentDto } from "./tournament.dto";
import { TournamentService } from "./tournament.service";

@Controller("tournaments")
@UseGuards(JwtAuthGuard)
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Get()
  async getTournaments(@User() sub: string) {
    return this.tournamentService.getTournaments(sub);
  }

  @Post()
  @HttpCode(201)
  async createTournament(@Body() body: TournamentDto, @User() sub: string) {
    return this.tournamentService.createTournament(body, sub);
  }

  @Get(":tournamentId")
  async getTournament(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getTournament(tournamentId, sub);
  }

  @Patch(":tournamentId")
  async updateTournament(
    @Param("tournamentId") tournamentId: string,
    @Body() body: TournamentDto,
    @User() sub: string,
  ) {
    const updated = await this.tournamentService.updateTournament(
      tournamentId,
      sub,
      body,
    );
    return { message: "Tournament updated", tournament: updated };
  }

  @Delete(":tournamentId")
  async deleteTournament(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
  ) {
    await this.tournamentService.deleteTournament(tournamentId, sub);
    return { message: "Tournament deleted" };
  }

  @Get(":tournamentId/stats")
  async getStats(
    @Param("tournamentId") tournamentId: string,
    @User() sub: string,
  ) {
    return await this.tournamentService.getTournamentStats(tournamentId, sub);
  }
}
