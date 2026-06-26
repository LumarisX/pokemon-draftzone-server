import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { WebhookGuard } from "./webhook.guard";
import { UserService } from "@modules/user/user.service";
import { Auth0UserDto } from "@modules/user/user.dto";
import { UserMapper } from "@modules/user/user.mapper";

@Controller("webhooks")
export class WebhookController {
  constructor(private readonly usersService: UserService) {}

  @Post("users/sync")
  @UseGuards(WebhookGuard)
  async syncUser(@Body() data: Auth0UserDto) {
    const user = UserMapper.fromAuth0(data);
    return this.usersService.syncUser(user);
  }
}
