import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { User } from "@core/decorators/user.decorator";
import { UserService } from "./user.service";
import { SettingsDto } from "./user.dto";

@Controller("user")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("settings")
  async getSettings(@User() sub: string) {
    const management = await this.userService.getManagementToken();
    const user = await management.users.get(sub);
    return user.user_metadata?.settings ?? null;
  }

  @Patch("settings")
  @HttpCode(201)
  async updateSettings(@User() sub: string, @Body() body: SettingsDto) {
    const management = await this.userService.getManagementToken();
    await management.users.update(sub, {
      user_metadata: { settings: body.setbody },
    });
    return { settings: body.settings };
  }
}
