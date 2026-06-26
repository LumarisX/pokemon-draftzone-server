import { User, UserSettings } from "./user.domain";
import { Auth0UserDto, UserSettingsDto } from "./user.dto";
import { UserEntity, UserSettingsEntity } from "./user.schema";

export class UserMapper {
  static toClientPayload(user: User) {
    return {
      sub: user.sub,
      settings: user.settings,
      joined: user.joined,
      lastLogin: user.lastLogin,
      lastCheckedAdsAt: user.lastCheckedAdsAt,
    };
  }

  static fromAuth0(data: Auth0UserDto): User {
    return new User({
      sub: data.auth0Sub,
      lastLogin: new Date(data.lastLogin),
      joined: new Date(data.joined),
    });
  }

  static fromDatabase(entity: UserEntity): User {
    return new User({
      sub: entity.auth0Sub,
      settings: UserSettingsMapper.fromDatabase(entity.settings),
      joined: entity.joined,
      lastLogin: entity.lastLogin,
      lastCheckedAdsAt: entity.lastCheckedAdsAt,
    });
  }
}

export class UserSettingsMapper {
  static toDatabasePayload(settings: UserSettings): UserSettingsEntity {
    return {
      shinyUnlock: settings.shinyUnlock,
      spriteSet: settings.spriteSet,
      theme: settings.theme,
      ldMode: settings.ldMode,
      themeOverride: settings.themeOverride,
    };
  }

  static toClientPayload(settings: UserSettings) {
    return {
      shinyUnlock: settings.shinyUnlock ?? true,
      spriteSet: settings.spriteSet ?? "home",
      theme: settings.theme ?? "classic",
      ldMode: settings.ldMode ?? "device",
      themeOverride: settings.themeOverride || null,
    };
  }

  static fromForm(dto: UserSettingsDto): UserSettings {
    return new UserSettings({
      shinyUnlock: dto.shinyUnlock,
      spriteSet: dto.spriteSet,
      theme: dto.theme,
      ldMode: dto.ldMode,
      themeOverride: dto.themeOverride,
    });
  }

  static fromDatabase(entity: UserSettingsEntity): UserSettings {
    if (!entity) return new UserSettings();
    return new UserSettings({
      shinyUnlock: entity.shinyUnlock,
      spriteSet: entity.spriteSet,
      theme: entity.theme,
      ldMode: entity.ldMode,
      themeOverride: entity.themeOverride,
    });
  }
}
