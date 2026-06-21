import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  DraftPickDto,
  MakeTradeDto,
  SetDivisionStateDto,
  SetPicksDto,
  UpdateMatchupDto,
} from "./division.dto";
import { DivisionService } from "./division.service";

@Controller("league/:leagueKey/tournaments/:tournamentKey/divisions")
@UseGuards(JwtAuthGuard)
export class DivisionController {
  constructor(private readonly divisionService: DivisionService) {}

  @Get(":divisionKey")
  async getDetails(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
  ) {
    return this.divisionService.getDetails(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
    );
  }

  @Get(":divisionKey/teams")
  async getTeams(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
  ) {
    return this.divisionService.getTeams(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
    );
  }

  @Get(":divisionKey/teams/:teamId")
  async getTeam(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Param("teamId") teamId: string,
  ) {
    return this.divisionService.getTeam(
      leagueKey,
      tournamentKey,
      divisionKey,
      teamId,
    );
  }

  @Get(":divisionKey/picks")
  async getPicks(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
  ) {
    return this.divisionService.getPicks(leagueKey, tournamentKey, divisionKey);
  }

  @Get(":divisionKey/schedule")
  async getSchedule(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Query("teamId") teamId?: string | string[],
    @Query("stage") stage?: string,
  ) {
    return this.divisionService.getSchedule(
      leagueKey,
      tournamentKey,
      divisionKey,
      teamId,
      stage,
    );
  }

  @Post(":divisionKey/schedule/:matchupId")
  async updateMatchup(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Param("matchupId") matchupId: string,
    @User() sub: string,
    @Body() body: UpdateMatchupDto,
  ) {
    return this.divisionService.updateMatchup(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
      matchupId,
      body,
    );
  }

  @Get(":divisionKey/standings")
  async getStandings(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
  ) {
    return this.divisionService.getStandings(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
  }

  @Get(":divisionKey/order")
  async getOrder(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
  ) {
    return this.divisionService.getOrder(leagueKey, tournamentKey, divisionKey);
  }

  @Get(":divisionKey/power-rankings")
  async getPowerRankings(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
  ) {
    return this.divisionService.getPowerRankings(
      leagueKey,
      tournamentKey,
      divisionKey,
    );
  }

  @Get(":divisionKey/trades")
  async getTrades(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Query("teamId") teamId?: string | string[],
  ) {
    return this.divisionService.getTrades(
      leagueKey,
      tournamentKey,
      divisionKey,
      teamId,
    );
  }

  @Post(":divisionKey/trades")
  async createTrade(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
    @Body() body: MakeTradeDto,
  ) {
    return this.divisionService.createTrade(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
      body,
    );
  }

  @Get(":divisionKey/pokemon-list")
  async getPokemonList(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
  ) {
    return this.divisionService.getPokemonList(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
    );
  }

  @Post(":divisionKey/teams/:teamId/draft")
  async draftPick(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: DraftPickDto,
  ) {
    return this.divisionService.draftPick(
      leagueKey,
      tournamentKey,
      divisionKey,
      teamId,
      sub,
      body,
    );
  }

  @Post(":divisionKey/teams/:teamId/picks")
  async setPicks(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: SetPicksDto,
  ) {
    return this.divisionService.setPicks(
      leagueKey,
      tournamentKey,
      divisionKey,
      teamId,
      sub,
      body,
    );
  }

  @Post(":divisionKey/state")
  async setState(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
    @Body() body: SetDivisionStateDto,
  ) {
    return this.divisionService.setState(
      leagueKey,
      tournamentKey,
      divisionKey,
      sub,
      body,
    );
  }

  @Post(":divisionKey/skip")
  async skipPick(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("divisionKey") divisionKey: string,
    @User() sub: string,
  ) {
    return this.divisionService.skipPick(leagueKey, tournamentKey, divisionKey, sub);
  }
}
