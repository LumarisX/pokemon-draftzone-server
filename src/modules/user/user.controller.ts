import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { UpdateProfileDto, UserSettingsDto } from "./user.dto";
import { UserMapper } from "./user.mapper";
import { UserService } from "./user.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("settings")
  async getSettings(@User() sub: string) {
    return this.userService.getSettings(sub);
  }

  @Patch("settings")
  async updateSettings(@User() sub: string, @Body() body: UserSettingsDto) {
    return this.userService.updateSettings(sub, body);
  }

  @Get("me")
  async getMe(@User() sub: string) {
    return UserMapper.toClientPayload(await this.userService.getOrCreateMe(sub));
  }

  @Patch("profile")
  async updateProfile(@User() sub: string, @Body() body: UpdateProfileDto) {
    return UserMapper.toClientPayload(
      await this.userService.updateProfile(sub, body),
    );
  }
}
