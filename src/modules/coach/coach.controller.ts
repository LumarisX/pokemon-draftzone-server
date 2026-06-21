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
import { CreateCoachDto, UpdateCoachDto } from "./coach.dto";
import { CoachService } from "./coach.service";

@Controller("coaches")
@UseGuards(JwtAuthGuard)
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  @Get(":coachId")
  async getCoach(@Param("coachId") coachId: string) {
    return this.coachService.getCoach(coachId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCoach(@User() sub: string, @Body() body: CreateCoachDto) {
    return this.coachService.createCoach(sub, body);
  }

  @Patch(":coachId")
  async updateCoach(
    @Param("coachId") coachId: string,
    @User() sub: string,
    @Body() body: UpdateCoachDto,
  ) {
    return this.coachService.updateCoach(coachId, sub, body);
  }

  @Delete(":coachId")
  async deleteCoach(@Param("coachId") coachId: string, @User() sub: string) {
    await this.coachService.deleteCoach(coachId, sub);
    return { message: "Coach deleted." };
  }
}
