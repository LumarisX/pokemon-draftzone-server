import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  AcceptOrganizerInviteDto,
  CreateOrganizerInviteDto,
  OrganizerInviteTokenDto,
  OrganizerNameDto,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.dto";
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
import { LeagueAdminService } from "./league-admin.service";

@Controller("leagues/:leagueSlug")
@UseGuards(JwtAuthGuard)
export class LeagueAdminController {
  constructor(private readonly adminService: LeagueAdminService) {}

  @Get("admins")
  async getAdmins(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string,
  ) {
    return this.adminService.getAdmins(leagueSlug, sub);
  }

  @Delete("admins/:adminSub")
  async removeAdmin(
    @Param("leagueSlug") leagueSlug: string,
    @Param("adminSub") adminSub: string,
    @User() sub: string,
  ) {
    return this.adminService.removeAdmin(leagueSlug, sub, adminSub);
  }

  @Patch("admins/:adminSub/name")
  async renameAdmin(
    @Param("leagueSlug") leagueSlug: string,
    @Param("adminSub") adminSub: string,
    @User() sub: string,
    @Body() body: OrganizerNameDto,
  ) {
    return this.adminService.renameAdmin(leagueSlug, sub, adminSub, body.name);
  }

  @Post("admins/invites")
  async createInvite(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string,
    @Body() body: CreateOrganizerInviteDto,
  ) {
    return this.adminService.createInvite(leagueSlug, sub, body.name);
  }

  @Delete("admins/invites/:inviteId")
  async revokeInvite(
    @Param("leagueSlug") leagueSlug: string,
    @Param("inviteId") inviteId: string,
    @User() sub: string,
  ) {
    return this.adminService.revokeInvite(leagueSlug, sub, inviteId);
  }

  @Post("admin-invites/preview")
  @HttpCode(HttpStatus.OK)
  async previewInvite(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string,
    @Body() body: OrganizerInviteTokenDto,
  ) {
    return this.adminService.previewInvite(leagueSlug, sub, body.token);
  }

  @Post("admin-invites/accept")
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param("leagueSlug") leagueSlug: string,
    @User() sub: string,
    @Body() body: AcceptOrganizerInviteDto,
  ) {
    return this.adminService.acceptInvite(
      leagueSlug,
      sub,
      body.token,
      body.name,
    );
  }
}
