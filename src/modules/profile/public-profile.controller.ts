import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ProfileService } from "./profile.service";

@Controller("profiles")
@UseGuards(JwtAuthGuard)
@OptionalAuth()
export class PublicProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(":id")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getPublicProfile(@Param("id") id: string, @User() viewer?: string) {
    return this.profileService.getPublicProfile(id, viewer);
  }
}
