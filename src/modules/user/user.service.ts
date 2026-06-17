import { Injectable } from "@nestjs/common";
import { Auth0UserDto, UserSettingsDto } from "./user.dto";
import { UserRepository } from "./user.repository";
import { UserSettings } from "./user.domain";

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getSettings(sub: string) {
    const user = await this.userRepository.getUserBySub(sub);
    return UserSettings.fromDatabase(user.settings).toClientPayload();
  }

  async updateSettings(sub: string, dto: UserSettingsDto) {
    const domainSettings = UserSettings.fromForm(dto);
    const updatedUser = await this.userRepository.updateSettings(
      sub,
      domainSettings.toDatabasePayload(),
    );
    return UserSettings.fromDatabase(updatedUser.settings).toClientPayload();
  }

  async syncUser(data: Auth0UserDto) {
    const payload = {
      lastLogin: new Date(data.lastLogin),
      joined: new Date(data.joined),
      settings: data.settings,
    };
    return await this.userRepository.upsertFromWebhook(data.auth0Sub, payload);
  }

  async getMe(sub: string) {
    return await this.userRepository.getUserBySub(sub);
  }
}
