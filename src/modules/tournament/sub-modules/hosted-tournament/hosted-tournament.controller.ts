import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
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
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  AssignTeamsDto,
  DecideApplicationDto,
  ReplaceCoachDto,
  SignUpDto,
  UpdateCoachDetailsDto,
  UpdateHostedTournamentSettingsDto,
  UpdateTeamDto,
  UpdateRulesDto,
} from "./hosted-tournament.dto";
import { HostedTournamentService } from "./hosted-tournament.service";
import {
  AllowWhileArchived,
  unarchivesTournament,
} from "./tournament-open.guard";

@Controller(["tournaments", "leagues/:leagueSlug/tournaments"])
export class HostedTournamentController {
  constructor(private readonly tournamentService: HostedTournamentService) {}

  @Get(":tournamentSlug")
  async getTournament(
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.getTournament(tournamentSlug);
  }

  @Get(":tournamentSlug/info")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTournamentInfo(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getInfo(tournamentSlug, sub);
  }

  @Get(":tournamentSlug/roles")
  @UseGuards(JwtAuthGuard)
  async getTournamentRoles(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getRoles(tournamentSlug, sub);
  }

  @Delete(":tournamentSlug/coaches/:coachId")
  @UseGuards(JwtAuthGuard)
  async removeParticipant(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
    @User() sub: string,
  ) {
    return this.tournamentService.removeParticipant(
      tournamentSlug,
      sub,
      coachId,
    );
  }

  @Get(":tournamentSlug/signup")
  @UseGuards(JwtAuthGuard)
  async getTournamentSignup(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.getSignup(tournamentSlug, sub);
  }

  @Post(":tournamentSlug/signup")
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 10 * 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  async createTournamentSignup(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: SignUpDto,
    @Query("invite") invite?: string,
  ) {
    return this.tournamentService.createSignup(
      tournamentSlug,
      sub,
      body,
      invite,
    );
  }

  @Post(":tournamentSlug/signup-token/rotate")
  @UseGuards(JwtAuthGuard)
  async rotateSignUpToken(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.tournamentService.rotateSignUpToken(
      tournamentSlug,
      sub,
    );
  }

  @Patch(":tournamentSlug/applications/:applicationId")
  @UseGuards(JwtAuthGuard)
  async decideTournamentApplication(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("applicationId") applicationId: string,
    @User() sub: string,
    @Body() body: DecideApplicationDto,
  ) {
    return this.tournamentService.decideApplication(
      tournamentSlug,
      applicationId,
      sub,
      body,
    );
  }

  @Post(":tournamentSlug/teams/:teamSlug/replace-coach")
  @UseGuards(JwtAuthGuard)
  async replaceTeamCoach(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("teamSlug") teamSlug: string,
    @User() sub: string,
    @Body() body: ReplaceCoachDto,
  ) {
    return this.tournamentService.replaceCoach(
      tournamentSlug,
      teamSlug,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/coaches")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTournamentCoaches(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getCoaches(tournamentSlug, sub);
  }

  @Get(":tournamentSlug/coaches/:coachId")
  async getTournamentCoach(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
  ) {
    return this.tournamentService.getCoach(tournamentSlug, coachId);
  }

  @Patch(":tournamentSlug/coaches/:coachId")
  @UseGuards(JwtAuthGuard)
  async updateTournamentCoach(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("coachId") coachId: string,
    @User() sub: string,
    @Body() body: UpdateCoachDetailsDto,
  ) {
    return this.tournamentService.updateCoachDetails(
      tournamentSlug,
      coachId,
      sub,
      body,
    );
  }

  @Patch(":tournamentSlug/teams")
  @UseGuards(JwtAuthGuard)
  async assignTournamentTeams(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AssignTeamsDto,
  ) {
    return this.tournamentService.assignTeams(
      tournamentSlug,
      sub,
      body.assignments,
    );
  }

  @Patch(":tournamentSlug/teams/:teamSlug")
  @UseGuards(JwtAuthGuard)
  async updateTournamentTeam(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("teamSlug") teamSlug: string,
    @User() sub: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.tournamentService.updateTeam(
      tournamentSlug,
      teamSlug,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/teams")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async listTeams(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.listTeams(tournamentSlug, sub);
  }

  @Get(":tournamentSlug/teams/by-pool")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async listTeamsByPool(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.listTeamsByPool(
      tournamentSlug,
      sub,
    );
  }

  @Get(":tournamentSlug/teams/:teamSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTeam(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("teamSlug") teamSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getTeam(
      tournamentSlug,
      teamSlug,
      sub,
    );
  }

  @Get(":tournamentSlug/standings")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getStandings(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getStandings(tournamentSlug, sub);
  }

  @Get(":tournamentSlug/settings")
  @UseGuards(JwtAuthGuard)
  async getTournamentSettings(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tournamentService.getSettings(tournamentSlug, sub);
  }

  @Patch(":tournamentSlug/settings")
  @UseGuards(JwtAuthGuard)
  @AllowWhileArchived(unarchivesTournament)
  async updateTournamentSettings(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateHostedTournamentSettingsDto,
  ) {
    return this.tournamentService.updateSettings(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Get(":tournamentSlug/rules")
  async getTournamentRules(
    @Param("tournamentSlug") tournamentSlug: string,
  ) {
    return this.tournamentService.getRules(tournamentSlug);
  }

  @Put(":tournamentSlug/rules")
  @UseGuards(JwtAuthGuard)
  async updateTournamentRules(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: UpdateRulesDto,
  ) {
    return this.tournamentService.updateRules(
      tournamentSlug,
      sub,
      body.ruleSections,
    );
  }
}
