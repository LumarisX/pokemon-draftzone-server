import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { WebhookGuard } from "./webhook.guard";
import { UserService } from "@modules/user/user.service";
import { Auth0UserDto } from "@modules/user/user.dto";

@Controller("webhooks")
export class WebhookController {
  constructor(private readonly usersService: UserService) {}

  @Post("users/sync")
  @UseGuards(WebhookGuard)
  async syncUser(@Body() data: Auth0UserDto) {
    return this.usersService.syncUser(data);
  }
}
