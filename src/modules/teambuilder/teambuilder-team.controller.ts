import { User } from "@core/decorators/user.decorator";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SaveTeamDto } from "./teambuilder-team.dto";
import { TeambuilderTeamService } from "./teambuilder-team.service";
import {
  TEAM_CONTEXT_TYPES,
  TeamContextType,
} from "./teambuilder-team.schema";

function parseContextType(value: string | undefined): TeamContextType {
  if (!value) {
    throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
      field: "contextType",
    });
  }
  if (!TEAM_CONTEXT_TYPES.includes(value as TeamContextType)) {
    throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
      field: "contextType",
    });
  }
  return value as TeamContextType;
}

@Controller("teambuilder/teams")
@UseGuards(JwtAuthGuard)
export class TeambuilderTeamController {
  constructor(private readonly teamService: TeambuilderTeamService) {}

  @Get()
  async list(
    @User() sub: string,
    @Query("contextType") contextType?: string,
    @Query("contextId") contextId?: string,
  ) {
    return this.teamService.listByContext(
      sub,
      parseContextType(contextType),
      contextId ?? "",
    );
  }

  @Get(":slug")
  async get(@User() sub: string, @Param("slug") slug: string) {
    return this.teamService.get(sub, slug);
  }

  @Post()
  async create(@User() sub: string, @Body() dto: SaveTeamDto) {
    return this.teamService.create(sub, dto);
  }

  @Put(":slug")
  async save(
    @User() sub: string,
    @Param("slug") slug: string,
    @Body() dto: SaveTeamDto,
  ) {
    return this.teamService.save(sub, slug, dto);
  }

  @Delete(":slug")
  async remove(@User() sub: string, @Param("slug") slug: string) {
    await this.teamService.remove(sub, slug);
    return { deleted: true };
  }
}
