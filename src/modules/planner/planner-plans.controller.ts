import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { PlannerPlansService } from "./planner-plans.service";

@Controller("planner/plans")
@UseGuards(JwtAuthGuard)
export class PlannerPlansController {
  constructor(private readonly plansService: PlannerPlansService) {}

  @Get()
  async getPlans(@User() sub: string, @Query("key") key?: string) {
    return key === undefined
      ? this.plansService.list(sub)
      : this.plansService.get(sub, key);
  }

  @Put()
  async savePlans(
    @User() sub: string,
    @Body() body: { key?: unknown; revision?: unknown; plans?: unknown },
  ) {
    return this.plansService.save(sub, body?.key, body?.revision, body?.plans);
  }
}
