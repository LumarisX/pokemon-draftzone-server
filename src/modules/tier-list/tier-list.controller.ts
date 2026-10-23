import { User } from "@core/decorators/user.decorator";
import { SkipGlobalThrottle } from "@core/guards/skip-global-throttle.decorator";
import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Roles } from "@modules/auth/roles.decorator";
import { RolesGuard } from "@modules/auth/roles.guard";
import { UserRole } from "@modules/user/user.schema";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ImportPreviewDto, SaveImportAliasesDto } from "./import/import.dto";
import { TierListImportService } from "./import/tier-list-import.service";
import { TierListSharingService } from "./tier-list-sharing.service";
import {
  AcceptTierListInviteDto,
  BrowseTierListsDto,
  CompareTierListDto,
  CreateTierListDto,
  CreateTierListInviteDto,
  ForkTierListDto,
  RevertTierListDto,
  RevisionPageDto,
  SetFeaturedDto,
  SetTierListRoleDto,
  UpdateTierListDto,
  UpdateTierListSettingsDto,
} from "./tier-list.dto";
import { TierListService } from "./tier-list.service";

@Controller("tier-lists")
@UseGuards(JwtAuthGuard)
export class TierListController {
  constructor(
    private readonly tierListService: TierListService,
    private readonly sharing: TierListSharingService,
    private readonly importer: TierListImportService,
  ) {}

  @Get()
  @OptionalAuth()
  async getTierLists(
    @Query() query: BrowseTierListsDto,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.browse(query, sub);
  }

  @Post()
  @UseGuards(UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60 * 60_000, limit: 60 } })
  async createTierList(
    @User() sub: string,
    @Body() body: CreateTierListDto,
  ) {
    return this.tierListService.create(body, sub);
  }

  @Post("import/preview")
  @UseGuards(UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async previewImport(@User() sub: string, @Body() body: ImportPreviewDto) {
    return this.importer.preview(body, sub);
  }

  @Post("import/aliases")
  async saveImportAliases(
    @User() sub: string,
    @Body() body: SaveImportAliasesDto,
  ) {
    return this.importer.saveAliases(sub, body);
  }

  @Delete("import/aliases")
  async clearImportAliases(@User() sub: string) {
    return this.importer.clearAliases(sub);
  }

  @Get("invites/:token")
  @OptionalAuth()
  async previewInvite(
    @Param("token") token: string,
    @User() sub: string | undefined,
  ) {
    return this.sharing.previewInvite(token, sub);
  }

  @Post("invites/:token/accept")
  async acceptInvite(
    @Param("token") token: string,
    @User() sub: string,
    @Body() body: AcceptTierListInviteDto,
  ) {
    return this.sharing.acceptInvite(token, sub, body.name);
  }

  @Get(":tierListSlug")
  @OptionalAuth()
  async getTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
    @Query("edit") edit?: string,
  ) {
    return this.tierListService.getTierList(tierListSlug, sub, edit === "true");
  }

  @Patch(":tierListSlug")
  async updateTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: UpdateTierListDto,
  ) {
    return this.tierListService.updateTierList(tierListSlug, sub, body);
  }

  @Delete(":tierListSlug")
  async deleteTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
  ) {
    return this.tierListService.remove(tierListSlug, sub);
  }

  @Post(":tierListSlug/fork")
  @UseGuards(UserThrottlerGuard)
  @SkipGlobalThrottle()
  @Throttle({ default: { ttl: 60 * 60_000, limit: 60 } })
  async forkTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: ForkTierListDto,
  ) {
    return this.tierListService.fork(tierListSlug, body, sub);
  }

  @Get(":tierListSlug/settings")
  @OptionalAuth()
  async getTierListSettings(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.getSettings(tierListSlug, sub);
  }

  @Patch(":tierListSlug/settings")
  async updateTierListSettings(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: UpdateTierListSettingsDto,
  ) {
    return this.tierListService.updateSettings(tierListSlug, sub, body);
  }

  @Patch(":tierListSlug/featured")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async setFeatured(
    @Param("tierListSlug") tierListSlug: string,
    @Body() body: SetFeaturedDto,
  ) {
    return this.tierListService.setFeatured(tierListSlug, body.featured);
  }

  @Get(":tierListSlug/revisions")
  @OptionalAuth()
  async getRevisions(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
    @Query() query: RevisionPageDto,
  ) {
    return this.tierListService.revisions(tierListSlug, sub, query.before);
  }

  @Get(":tierListSlug/revisions/:version")
  @OptionalAuth()
  async getRevision(
    @Param("tierListSlug") tierListSlug: string,
    @Param("version", ParseIntPipe) version: number,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.revision(tierListSlug, sub, version);
  }

  @Post(":tierListSlug/revisions/:version/revert")
  async revert(
    @Param("tierListSlug") tierListSlug: string,
    @Param("version", ParseIntPipe) version: number,
    @User() sub: string,
    @Body() body: RevertTierListDto,
  ) {
    return this.tierListService.revert(tierListSlug, sub, version, body.version);
  }

  @Get(":tierListSlug/compare")
  @OptionalAuth()
  async compare(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
    @Query() query: CompareTierListDto,
  ) {
    return this.tierListService.compare(tierListSlug, sub, query);
  }

  @Get(":tierListSlug/legality")
  @OptionalAuth()
  async legality(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.legality(tierListSlug, sub);
  }

  @Get(":tierListSlug/export")
  @OptionalAuth()
  async export(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.export(tierListSlug, sub);
  }

  @Get(":tierListSlug/members")
  async getMembers(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
  ) {
    return this.sharing.members(tierListSlug, sub);
  }

  @Post(":tierListSlug/invites")
  async createInvite(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: CreateTierListInviteDto,
  ) {
    return this.sharing.createInvite(tierListSlug, sub, body);
  }

  @Delete(":tierListSlug/invites/:inviteId")
  async revokeInvite(
    @Param("tierListSlug") tierListSlug: string,
    @Param("inviteId") inviteId: string,
    @User() sub: string,
  ) {
    return this.sharing.revokeInvite(tierListSlug, sub, inviteId);
  }

  @Patch(":tierListSlug/members/:memberId")
  async setRole(
    @Param("tierListSlug") tierListSlug: string,
    @Param("memberId") memberId: string,
    @User() sub: string,
    @Body() body: SetTierListRoleDto,
  ) {
    return this.sharing.setRole(tierListSlug, sub, memberId, body.role);
  }

  @Delete(":tierListSlug/members/:memberId")
  async removeMember(
    @Param("tierListSlug") tierListSlug: string,
    @Param("memberId") memberId: string,
    @User() sub: string,
  ) {
    return this.sharing.removeMember(tierListSlug, sub, memberId);
  }

  @Post(":tierListSlug/members/:memberId/transfer")
  async transfer(
    @Param("tierListSlug") tierListSlug: string,
    @Param("memberId") memberId: string,
    @User() sub: string,
  ) {
    return this.sharing.transfer(tierListSlug, sub, memberId);
  }
}
