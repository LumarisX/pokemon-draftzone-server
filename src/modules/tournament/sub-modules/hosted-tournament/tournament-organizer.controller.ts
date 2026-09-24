import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
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
  UseGuards,
} from "@nestjs/common";
import {
  AcceptOrganizerInviteDto,
  AddOrganizerDto,
  CreateOrganizerInviteDto,
  OrganizerInviteTokenDto,
  OrganizerNameDto,
} from "./hosted-tournament.dto";
import { AllowWhileArchived } from "./tournament-open.guard";
import { TournamentOrganizerService } from "./tournament-organizer.service";

@Controller("leagues/:leagueSlug/tournaments")
@UseGuards(JwtAuthGuard)
export class TournamentOrganizerController {
  constructor(private readonly organizerService: TournamentOrganizerService) {}

  @Get(":tournamentSlug/organizers")
  async getOrganizers(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.organizerService.getOrganizers(leagueSlug, tournamentSlug, sub);
  }

  @Post(":tournamentSlug/organizers")
  async addOrganizer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AddOrganizerDto,
  ) {
    return this.organizerService.addOrganizer(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":tournamentSlug/organizers/:organizerSub")
  async removeOrganizer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("organizerSub") organizerSub: string,
    @User() sub: string,
  ) {
    return this.organizerService.removeOrganizer(
      leagueSlug,
      tournamentSlug,
      sub,
      organizerSub,
    );
  }

  @Patch(":tournamentSlug/organizers/:organizerSub/name")
  async renameOrganizer(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("organizerSub") organizerSub: string,
    @User() sub: string,
    @Body() body: OrganizerNameDto,
  ) {
    return this.organizerService.renameOrganizer(
      leagueSlug,
      tournamentSlug,
      sub,
      organizerSub,
      body.name,
    );
  }

  @Post(":tournamentSlug/organizers/invites")
  async createInvite(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: CreateOrganizerInviteDto,
  ) {
    return this.organizerService.createInvite(
      leagueSlug,
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":tournamentSlug/organizers/invites/:inviteId")
  async revokeInvite(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("inviteId") inviteId: string,
    @User() sub: string,
  ) {
    return this.organizerService.revokeInvite(
      leagueSlug,
      tournamentSlug,
      sub,
      inviteId,
    );
  }

  @Post(":tournamentSlug/organizer-invites/preview")
  @HttpCode(HttpStatus.OK)
  @AllowWhileArchived()
  async previewInvite(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: OrganizerInviteTokenDto,
  ) {
    return this.organizerService.previewInvite(
      leagueSlug,
      tournamentSlug,
      sub,
      body.token,
    );
  }

  @Post(":tournamentSlug/organizer-invites/accept")
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param("leagueSlug") leagueSlug: string,
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AcceptOrganizerInviteDto,
  ) {
    return this.organizerService.acceptInvite(
      leagueSlug,
      tournamentSlug,
      sub,
      body.token,
      body.name,
    );
  }
}
