import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AccountDeletionService } from "./account-deletion.service";
import { AccountMergeService } from "./account-merge.service";
import {
  DiscordCallbackDto,
  DiscordConnectDto,
  MergeAccountsDto,
  UpdateProfileDto,
  UserSettingsDto,
} from "./user.dto";
import { UserMapper } from "./user.mapper";
import { UserService } from "./user.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly merges: AccountMergeService,
    private readonly deletions: AccountDeletionService,
  ) {}

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
    return UserMapper.toClientPayload(await this.userService.getMeConnected(sub));
  }

  @Get("me/deletion")
  async getDeletion(@User() sub: string) {
    return this.deletions.status(sub);
  }

  @Post("me/deletion")
  async scheduleDeletion(@User() sub: string) {
    return this.deletions.schedule(sub);
  }

  @Delete("me/deletion")
  async cancelDeletion(@User() sub: string) {
    return this.deletions.cancel(sub);
  }

  @Patch("profile")
  async updateProfile(@User() sub: string, @Body() body: UpdateProfileDto) {
    return UserMapper.toClientPayload(
      await this.userService.updateProfile(sub, body),
    );
  }

  @Post("discord/connect")
  async connectDiscord(@User() sub: string, @Body() body: DiscordConnectDto) {
    return this.userService.connectDiscord(sub, body.returnTo);
  }

  @Post("discord/callback")
  async discordCallback(@User() sub: string, @Body() body: DiscordCallbackDto) {
    const { user, returnTo } = await this.userService.completeDiscordConnect(
      sub,
      body.code,
      body.state,
    );
    return { me: UserMapper.toClientPayload(user), returnTo };
  }

  @Post("merge")
  async mergeAccounts(@User() sub: string, @Body() body: MergeAccountsDto) {
    const { user } = await this.merges.merge(sub, body.token, body.keep);
    return { me: UserMapper.toClientPayload(user) };
  }

  @Delete("discord")
  async disconnectDiscord(@User() sub: string) {
    return UserMapper.toClientPayload(
      await this.userService.disconnectDiscord(sub),
    );
  }
}
