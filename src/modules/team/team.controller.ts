import { User } from "@core/decorators/user.decorator";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
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
  Query,
  UseGuards,
} from "@nestjs/common";
import { CreateTeamDto, UpdateTeamDto } from "./team.dto";
import { TeamService } from "./team.service";

@Controller("teams")
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  async findByCoach(@Query("coachId") coachId?: string) {
    if (!coachId)
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "coachId",
      });
    return this.teamService.getTeamByCoach(coachId);
  }

  @Get(":teamId")
  async getTeam(@Param("teamId") teamId: string) {
    return this.teamService.getTeam(teamId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTeam(@User() sub: string, @Body() body: CreateTeamDto) {
    const canCreate = await this.teamService.canCreateTeamForCoach(
      body.coachId,
      sub,
    );
    if (!canCreate) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    return this.teamService.createTeam({
      tournamentId: body.tournamentId,
      coach: body.coachId,
      teamName: body.teamName,
      logo: body.logo,
    });
  }

  @Patch(":teamId")
  async updateTeam(
    @Param("teamId") teamId: string,
    @User() sub: string,
    @Body() body: UpdateTeamDto,
  ) {
    const team = await this.teamService.getTeam(teamId);
    const canManage = await this.teamService.canManageTeam(team, sub);
    if (!canManage) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    return this.teamService.updateTeam(teamId, body);
  }

  @Delete(":teamId")
  async deleteTeam(@Param("teamId") teamId: string, @User() sub: string) {
    const team = await this.teamService.getTeam(teamId);
    const canManage = await this.teamService.canManageTeam(team, sub);
    if (!canManage) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    await this.teamService.deleteTeam(teamId);
    return { message: "Team deleted." };
  }
}
