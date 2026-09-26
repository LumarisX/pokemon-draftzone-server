import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CreatePoolDto } from "./draft.dto";
import { DraftService } from "./draft.service";

@Controller([
  "tournaments/:tournamentSlug/pools",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/pools",
  "leagues/:leagueSlug/tournaments/:tournamentSlug/drafts",
])
@UseGuards(JwtAuthGuard)
export class DraftPoolsController {
  constructor(private readonly draftService: DraftService) {}

  @Get()
  async list(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.listPools(tournamentSlug, sub);
  }

  @Post()
  async create(
    @Param("tournamentSlug") tournamentSlug: string,
    @User() sub: string,
    @Body() body: CreatePoolDto,
  ) {
    return this.draftService.createPool(
      tournamentSlug,
      sub,
      body,
    );
  }

  @Delete(":poolSlug")
  async remove(
    @Param("tournamentSlug") tournamentSlug: string,
    @Param("poolSlug") poolSlug: string,
    @User() sub: string,
  ) {
    return this.draftService.deletePool(
      tournamentSlug,
      poolSlug,
      sub,
    );
  }
}
