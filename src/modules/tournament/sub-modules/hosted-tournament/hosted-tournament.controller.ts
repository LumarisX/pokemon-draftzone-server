import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.dectorator";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  AssignCoachesDto,
  SignUpDto,
  UpdateCoachLogoDto,
  UpdateRulesDto,
} from "./hosted-tournament.dto";
import { HostedTournamentService } from "./hosted-tournament.service";

@Controller("league/:leagueKey/tournaments")
export class HostedTournamentController {
  constructor(private readonly tournamentService: HostedTournamentService) {}

  @Get(":tournamentKey")
  async getTournament(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
  ) {
    return this.tournamentService.getTournament(leagueKey, tournamentKey);
  }

  @Get(":tournamentKey/bracket")
  async getTournamentBracket(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
  ) {
    return this.tournamentService.getBracket(leagueKey, tournamentKey);
  }

  @Get(":tournamentKey/info")
  async getTournamentInfo(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
  ) {
    return this.tournamentService.getInfo(leagueKey, tournamentKey);
  }

  @Get(":tournamentKey/roles")
  @UseGuards(JwtAuthGuard)
  async getTournamentRoles(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getRoles(leagueKey, tournamentKey, sub);
  }

  @Get(":tournamentKey/signup")
  @UseGuards(JwtAuthGuard)
  async getTournamentSignup(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getSignup(leagueKey, tournamentKey, sub);
  }

  @Post(":tournamentKey/signup")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTournamentSignup(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: SignUpDto,
  ) {
    return this.tournamentService.createSignup(
      leagueKey,
      tournamentKey,
      sub,
      body,
    );
  }

  @Get(":tournamentKey/coaches")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTournamentCoaches(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getCoaches(leagueKey, tournamentKey, sub);
  }

  @Patch(":tournamentKey/coaches")
  @UseGuards(JwtAuthGuard)
  async assignTournamentCoaches(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: AssignCoachesDto,
  ) {
    return this.tournamentService.assignCoaches(
      leagueKey,
      tournamentKey,
      sub,
      body.assignments,
    );
  }

  @Get(":tournamentKey/coaches/:coachId")
  async getTournamentCoach(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("coachId") coachId: string,
  ) {
    return this.tournamentService.getCoach(leagueKey, tournamentKey, coachId);
  }

  @Patch(":tournamentKey/coaches/:coachId/logo")
  @UseGuards(JwtAuthGuard)
  async setTournamentCoachLogo(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @Param("coachId") coachId: string,
    @User() sub: string,
    @Body() body: UpdateCoachLogoDto,
  ) {
    return this.tournamentService.setCoachLogo(
      leagueKey,
      tournamentKey,
      coachId,
      sub,
      body,
    );
  }

  @Get(":tournamentKey/rules")
  async getTournamentRules(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
  ) {
    return this.tournamentService.getRules(leagueKey, tournamentKey);
  }

  @Post(":tournamentKey/rules")
  @UseGuards(JwtAuthGuard)
  async updateTournamentRules(
    @Param("leagueKey") leagueKey: string,
    @Param("tournamentKey") tournamentKey: string,
    @User() sub: string,
    @Body() body: UpdateRulesDto,
  ) {
    return this.tournamentService.updateRules(
      leagueKey,
      tournamentKey,
      sub,
      body.ruleSections,
    );
  }
}
