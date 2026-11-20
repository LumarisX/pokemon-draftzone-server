import { User, UserProfile, UserSettings } from "./user.domain";
import { Auth0UserDto, UserSettingsDto } from "./user.dto";
import { discordIdFromSignIn } from "./user.identity";
import {
  UserEntity,
  UserProfileEntity,
  UserRole,
  UserSettingsEntity,
} from "./user.schema";

const KNOWN_ROLES = new Set<string>(Object.values(UserRole));

function toUserRoles(roles?: string[]): UserRole[] | undefined {
  if (roles === undefined) return undefined;
  return roles.filter((role): role is UserRole => KNOWN_ROLES.has(role));
}

export class UserMapper {
  static toClientPayload(user: User) {
    return {
      sub: user.sub,
      profileId: user.profileId ?? null,
      displayName: user.displayName ?? null,
      profile: {
        gameName: user.profile?.gameName ?? null,
        timezone: user.profile?.timezone ?? null,
      },
      discord: user.discord
        ? {
            id: user.discord.id,
            username: user.discord.username,
            connectedAt: new Date(user.discord.connectedAt).toISOString(),
            viaSignIn: discordIdFromSignIn(user.signIn ?? user.sub) !== null,
          }
        : null,
      privateProfile: user.privateProfile ?? false,
      roles: user.roles ?? [],
      settings: user.settings,
      joined: user.joined,
      lastLogin: user.lastLogin,
      lastCheckedAdsAt: user.lastCheckedAdsAt,
    };
  }

  static fromAuth0(data: Auth0UserDto): User {
    return new User({
      sub: data.auth0Sub,
      signIn: data.auth0Sub,
      username: data.username,
      roles: toUserRoles(data.roles),
      lastLogin: new Date(data.lastLogin),
      joined: new Date(data.joined),
    });
  }

  static fromDatabase(
    entity: UserEntity & { _id?: unknown },
    internalIds = false,
  ): User {
    return new User({
      sub: internalIds ? String(entity._id) : entity.auth0Sub,
      signIn: entity.auth0Sub,
      profileId: entity._id === undefined ? undefined : String(entity._id),
      username: entity.username,
      displayName: entity.displayName,
      profile: UserProfileMapper.fromDatabase(entity.profile),
      discord: entity.discord
        ? {
            id: entity.discord.id,
            username: entity.discord.username,
            connectedAt: entity.discord.connectedAt,
            refreshedAt: entity.discord.refreshedAt,
          }
        : undefined,
      privateProfile: entity.privateProfile,
      roles: entity.roles ?? [],
      settings: UserSettingsMapper.fromDatabase(entity.settings),
      joined: entity.joined,
      lastLogin: entity.lastLogin,
      lastCheckedAdsAt: entity.lastCheckedAdsAt,
    });
  }
}

export class UserProfileMapper {
  static fromDatabase(entity?: UserProfileEntity): UserProfile | undefined {
    if (!entity) return undefined;
    return new UserProfile({
      discordName: entity.discordName,
      gameName: entity.gameName,
      timezone: entity.timezone,
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
