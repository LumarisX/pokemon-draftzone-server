import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Roles } from "@modules/auth/roles.decorator";
import { RolesGuard } from "@modules/auth/roles.guard";
import { UserRole } from "@modules/user/user.schema";
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { BucketUnit } from "./admin.repository";

const BUCKETS: BucketUnit[] = ["day", "week", "month"];

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users/summary")
  getSummary() {
    return this.adminService.getSummary();
  }

  @Get("users/login-providers")
  getLoginProviders() {
    return this.adminService.getLoginProviders();
  }

  @Get("users/engagement")
  getEngagement() {
    return this.adminService.getEngagement();
  }

  @Get("users/account-age")
  getAccountAge() {
    return this.adminService.getAccountAge();
  }

  @Get("users/settings-distribution")
  getSettingsDistribution() {
    return this.adminService.getSettingsDistributions();
  }

  @Get("users/time-series")
  getTimeSeries(@Query("bucket") bucket = "day") {
    if (!BUCKETS.includes(bucket as BucketUnit)) {
      throw new BadRequestException(
        `bucket must be one of: ${BUCKETS.join(", ")}`,
      );
    }
    return this.adminService.getTimeSeries(bucket as BucketUnit);
  }
}
