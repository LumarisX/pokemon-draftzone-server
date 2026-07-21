import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { Injectable } from "@nestjs/common";
import { User, UserSettings } from "./user.domain";
import { UserRepository } from "./user.repository";
import { UserSettingsDto } from "./user.dto";
import { UserSettingsEntity } from "./user.schema";

const USER_CACHE_TTL_MS = 60_000;

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly appCache: AppCacheService,
  ) {}

  async getSettings(sub: string): Promise<UserSettings> {
    const user = await this.getMe(sub);
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
    await this.appCache.invalidate(CacheKeys.user(sub));

    return updatedUserDoc.settings;
  }

  async syncUser(user: User) {
    const updatedUserDoc = await this.userRepository.updateUser(user);
    await this.appCache.invalidate(CacheKeys.user(user.sub));
    return updatedUserDoc;
  }

  async getMe(sub: string): Promise<User> {
    return await this.appCache.getOrSet(
      CacheKeys.user(sub),
      USER_CACHE_TTL_MS,
      () => this.userRepository.getUserBySub(sub),
    );
  }

  async getUsername(sub: string): Promise<string | undefined> {
    try {
      return (await this.getMe(sub)).username;
    } catch {
      return undefined;
    }
  }
}
