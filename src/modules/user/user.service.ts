import { Injectable } from "@nestjs/common";
import { User, UserSettings } from "./user.domain";
import { UserRepository } from "./user.repository";
import { UserSettingsDto } from "./user.dto";
import { UserSettingsEntity } from "./user.schema";

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getSettings(sub: string): Promise<UserSettings> {
    const user = await this.userRepository.getUserBySub(sub);
    return user.settings ?? {};
  }

  async updateSettings(
    sub: string,
    dto: UserSettingsDto,
  ): Promise<UserSettingsEntity> {
    const user = await this.userRepository.getUserBySub(sub);
    const updatedSettingsPayload: UserSettingsEntity = {
      ...user.settings,
      ...dto,
    };
    const updatedUserDoc = await this.userRepository.updateSettings(
      sub,
      updatedSettingsPayload,
    );

    return updatedUserDoc.settings;
  }
  async syncUser(user: User) {
    return await this.userRepository.updateUser(user);
  }

  async getMe(sub: string): Promise<User> {
    return await this.userRepository.getUserBySub(sub);
  }
}
