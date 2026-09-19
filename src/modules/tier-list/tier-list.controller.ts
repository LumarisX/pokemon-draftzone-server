import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  BrowseTierListsDto,
  CreateTierListDto,
  ForkTierListDto,
  UpdateTierListDto,
  UpdateTierListSettingsDto,
} from "./tier-list.dto";
import { TierListService } from "./tier-list.service";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";

@Controller("tier-lists")
@UseGuards(JwtAuthGuard)
export class TierListController {
  constructor(private readonly tierListService: TierListService) {}

  @Get()
  @OptionalAuth()
  async getTierLists(
    @Query() query: BrowseTierListsDto,
    @User() sub: string | undefined,
  ) {
    return this.tierListService.browse(query, sub);
  }

  @Post()
  async createTierList(
    @User() sub: string,
    @Body() body: CreateTierListDto,
  ) {
    return this.tierListService.create(body, sub);
  }

  @Post(":tierListSlug/fork")
  async forkTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: ForkTierListDto,
  ) {
    return this.tierListService.fork(tierListSlug, body, sub);
  }

  @Get(":tierListSlug")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string | undefined,
    @Query("edit") edit?: string,
  ) {
    return this.tierListService.getTierList(tierListSlug, sub, edit === "true");
  }

  @Patch(":tierListSlug")
  @UseGuards(JwtAuthGuard)
  async updateTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: UpdateTierListDto,
  ) {
    return this.tierListService.updateTierList(tierListSlug, sub, body);
  }

  @Get(":tierListSlug/settings")
  @UseGuards(JwtAuthGuard)
  async getTierListSettings(@Param("tierListSlug") tierListSlug: string) {
    return this.tierListService.getSettings(tierListSlug);
  }

  @Delete(":tierListSlug")
  async deleteTierList(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
  ) {
    return this.tierListService.remove(tierListSlug, sub);
  }

  @Patch(":tierListSlug/settings")
  @UseGuards(JwtAuthGuard)
  async updateTierListSettings(
    @Param("tierListSlug") tierListSlug: string,
    @User() sub: string,
    @Body() body: UpdateTierListSettingsDto,
  ) {
    return this.tierListService.updateSettings(tierListSlug, sub, body);
  }
}
