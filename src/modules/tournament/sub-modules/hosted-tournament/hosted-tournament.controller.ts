import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  AssignCoachesDto,
  SignUpDto,
  UpdateCoachLogoDto,
  UpdateHostedTournamentSettingsDto,
  UpdateRulesDto,
} from "./hosted-tournament.dto";
import { HostedTournamentService } from "./hosted-tournament.service";

@Controller("leagues/:leagueSlug/tournaments")
export class HostedTournamentController {
  constructor(private readonly tournamentService: HostedTournamentService) {}

  @Get(":tournamentSlug")
  async getTournament(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.getTournament(leagueSlug, tournamentSlug);
  }

  @Get(":tournamentSlug/bracket")
  async getTournamentBracket(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.getBracket(leagueSlug, tournamentSlug);
  }

  @Get(":tournamentSlug/info")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTournamentInfo(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getInfo(leagueSlug, tournamentSlug, sub);
  }

  @Get(":tournamentSlug/roles")
  @UseGuards(JwtAuthGuard)
  async getTournamentRoles(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getRoles(leagueSlug, tournamentSlug, sub);
  }

  @Get(":tournamentSlug/signup")
  @UseGuards(JwtAuthGuard)
  async getTournamentSignup(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getSignup(leagueSlug, tournamentSlug, sub);
  }

  @Post(":tournamentSlug/signup")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTournamentSignup(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: SignUpDto,
  ) {
    return this.tournamentService.createSignup(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/coaches")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTournamentCoaches(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getCoaches(leagueSlug, tournamentSlug, sub);
  }

  @Patch(":tournamentSlug/coaches")
  @UseGuards(JwtAuthGuard)
  async assignTournamentCoaches(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AssignCoachesDto,
  ) {
    return this.tournamentService.assignCoaches(
      leagueSlug,
      tournamentSlug,
      sub,
      body.assignments,
    );
  }

  @Get(":tournamentSlug/coaches/:coachId")
  async getTournamentCoach(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
  ) {
    return this.tournamentService.getCoach(leagueSlug, tournamentSlug, coachId);
  }

  @Patch(":tournamentSlug/coaches/:coachId/logo")
  @UseGuards(JwtAuthGuard)
  async setTournamentCoachLogo(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
    @User() sub: string,
    @Body() body: UpdateCoachLogoDto,
  ) {
    return this.tournamentService.setCoachLogo(
      leagueSlug,
      tournamentSlug,
      coachId,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/teams")
  async listTeams(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.listTeams(leagueSlug, tournamentSlug);
  }

  @Get(":tournamentSlug/teams/:teamId")
  async getTeam(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("teamId") teamId: string,
    @Query("stageId") stageId?: string,
  ) {
    return this.tournamentService.getTeam(
      leagueSlug,
      tournamentSlug,
      teamId,
      stageId,
    );
  }

  @Get(":tournamentSlug/settings")
  @UseGuards(JwtAuthGuard)
  async getTournamentSettings(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getSettings(leagueSlug, tournamentSlug, sub);
  }

  @Patch(":tournamentSlug/settings")
  @UseGuards(JwtAuthGuard)
  async updateTournamentSettings(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateHostedTournamentSettingsDto,
  ) {
    return this.tournamentService.updateSettings(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/rules")
  async getTournamentRules(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.getRules(leagueSlug, tournamentSlug);
  }

  @Post(":tournamentSlug/rules")
  @UseGuards(JwtAuthGuard)
  async updateTournamentRules(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateRulesDto,
  ) {
    return this.tournamentService.updateRules(
      leagueSlug,
      tournamentSlug,
      sub,
      body.ruleSections,
    );
  }
}
