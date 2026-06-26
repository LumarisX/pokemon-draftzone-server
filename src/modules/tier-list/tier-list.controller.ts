import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UpdateTierListDto, UpdateTierListSettingsDto } from "./tier-list.dto";
import { TierListService } from "./tier-list.service";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";

@Controller("tier-lists")
@UseGuards(JwtAuthGuard)
export class TierListController {
  constructor(private readonly tierListService: TierListService) {}

  @Get()
  async getTierLists() {}

  @Post()
  async createTierList() {}

  @Get(":tierListId")
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getTierList(
    @Param("tierListId") tierListId: string,
    @User() sub: string | undefined,
    @Query("edit") edit?: string,
  ) {
    return this.tierListService.getTierList(tierListId, sub, edit === "true");
  }

  @Patch(":tierListId")
  @UseGuards(JwtAuthGuard)
  async updateTierList(
    @Param("tierListId") tierListId: string,
    @User() sub: string,
    @Body() body: UpdateTierListDto,
  ) {
    return this.tierListService.updateTierList(tierListId, sub, body);
  }

  @Get(":tierListId/settings")
  @UseGuards(JwtAuthGuard)
  async getTierListSettings(@Param("tierListId") tierListId: string) {
    return this.tierListService.getSettings(tierListId);
  }

  @Patch(":tierListId/settings")
  @UseGuards(JwtAuthGuard)
  async updateTierListSettings(
    @Param("tierListId") tierListId: string,
    @User() sub: string,
    @Body() body: UpdateTierListSettingsDto,
  ) {
    return this.tierListService.updateSettings(tierListId, sub, body);
  }
}
