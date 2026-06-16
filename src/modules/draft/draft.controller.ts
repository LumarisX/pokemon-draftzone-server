import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateTeamBody, DraftService } from "./draft.service";
import { User } from "@core/decorators/user.decorator";

@Controller("draft")
@UseGuards(JwtAuthGuard)
export class DraftController {
  private readonly logger = new Logger(DraftController.name);

  constructor(private readonly draftService: DraftService) {}

  @Get("teams")
  async getTeams(@User() sub: string) {
    this.logger.log(`getTeams called for sub: ${sub}`);
    return this.draftService.getTeams(sub);
  }

  @Post("teams")
  @HttpCode(201)
  async createTeam(@Body() body: CreateTeamBody, @User() sub: string) {
    return this.draftService.createTeam(body, sub);
  }

  @Get(":id")
  async getDraft(@Param("id") id: string) {}
}
