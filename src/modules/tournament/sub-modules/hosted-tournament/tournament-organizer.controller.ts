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

@Controller(["tournaments", "leagues/:leagueSlug/tournaments"])
@UseGuards(JwtAuthGuard)
export class TournamentOrganizerController {
  constructor(private readonly organizerService: TournamentOrganizerService) {}

  @Get(":tournamentSlug/organizers")
  async getOrganizers(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.organizerService.getOrganizers(tournamentSlug, sub);
  }

  @Post(":tournamentSlug/organizers")
  async addOrganizer(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AddOrganizerDto,
  ) {
    return this.organizerService.addOrganizer(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":tournamentSlug/organizers/:organizerSub")
  async removeOrganizer(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("organizerSub") organizerSub: string,
    @User() sub: string,
  ) {
    return this.organizerService.removeOrganizer(
      tournamentSlug,
      sub,
      organizerSub,
    );
  }

  @Patch(":tournamentSlug/organizers/:organizerSub/name")
  async renameOrganizer(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("organizerSub") organizerSub: string,
    @User() sub: string,
    @Body() body: OrganizerNameDto,
  ) {
    return this.organizerService.renameOrganizer(
      tournamentSlug,
      sub,
      organizerSub,
      body.name,
    );
  }

  @Post(":tournamentSlug/organizers/invites")
  async createInvite(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: CreateOrganizerInviteDto,
  ) {
    return this.organizerService.createInvite(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":tournamentSlug/organizers/invites/:inviteId")
  async revokeInvite(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("inviteId") inviteId: string,
    @User() sub: string,
  ) {
    return this.organizerService.revokeInvite(
      tournamentSlug,
      sub,
      inviteId,
    );
  }

  @Post(":tournamentSlug/organizer-invites/preview")
  @HttpCode(HttpStatus.OK)
  @AllowWhileArchived()
  async previewInvite(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: OrganizerInviteTokenDto,
  ) {
    return this.organizerService.previewInvite(
      tournamentSlug,
      sub,
      body.token,
    );
  }

  @Post(":tournamentSlug/organizer-invites/accept")
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: AcceptOrganizerInviteDto,
  ) {
    return this.organizerService.acceptInvite(
      tournamentSlug,
      sub,
      body.token,
      body.name,
    );
  }
}
