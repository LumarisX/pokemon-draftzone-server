import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import {
  Body,
  Controller,
  Delete,
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
  AddOrganizerDto,
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

  // GET :tournamentSlug/bracket lives on TournamentBracketController, which
  // serves rounds, stages and matches together and hides stages an organizer
  // has not released. A second handler here only shadowed it.

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

  @Get(":tournamentSlug/organizers")
  @UseGuards(JwtAuthGuard)
  async getOrganizers(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getOrganizers(
      leagueSlug,
      tournamentSlug,
      sub,
    );
  }

  @Get(":tournamentSlug/organizers/search")
  @UseGuards(JwtAuthGuard)
  async searchOrganizerCandidates(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Query("q") query: string,
  ) {
    return this.tournamentService.searchOrganizerCandidates(
      leagueSlug,
      tournamentSlug,
      sub,
      query ?? "",
    );
  }

  @Post(":tournamentSlug/organizers")
  @UseGuards(JwtAuthGuard)
  async addOrganizer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AddOrganizerDto,
  ) {
    return this.tournamentService.addOrganizer(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":tournamentSlug/organizers/:organizerSub")
  @UseGuards(JwtAuthGuard)
  async removeOrganizer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("organizerSub") organizerSub: string,
    @User() sub: string,
  ) {
    return this.tournamentService.removeOrganizer(
      leagueSlug,
      tournamentSlug,
      sub,
      organizerSub,
    );
  }

  @Delete(":tournamentSlug/coaches/:coachId")
  @UseGuards(JwtAuthGuard)
  async removeParticipant(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
    @User() sub: string,
  ) {
    return this.tournamentService.removeParticipant(
      leagueSlug,
      tournamentSlug,
      sub,
      coachId,
    );
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

  // Declared before `teams/:teamSlug` so the literal segment wins the match.
  @Get(":tournamentSlug/teams/by-draft")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async listTeamsByDraft(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.listTeamsByDraft(
      leagueSlug,
      tournamentSlug,
      sub,
    );
  }

  @Get(":tournamentSlug/teams/:teamSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTeam(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("teamSlug") teamSlug: string,
    @User() sub: string | undefined,
    @Query("stageSlug") stageSlug?: string,
  ) {
    return this.tournamentService.getTeam(
      leagueSlug,
      tournamentSlug,
      teamSlug,
      sub,
      stageSlug,
    );
  }

  @Get(":tournamentSlug/standings")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getStandings(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getStandings(leagueSlug, tournamentSlug, sub);
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
