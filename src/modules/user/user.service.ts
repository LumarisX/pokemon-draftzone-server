import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { AccountIdentityService } from "./account-identity.service";
import { DiscordNameSyncService } from "./discord-name-sync.service";
import { UserSignInRepository } from "./user-sign-in.repository";
import { User, UserSettings } from "./user.domain";
import { UpdateProfileDto, UserSettingsDto } from "./user.dto";
import {
  DISCORD_NAME_MAX,
  GAME_NAME_MAX,
  isValidTimeZone,
  normalizeDisplayName,
  randomCoachName,
} from "./user.identity";
import { PersonNames, PublicCard, UserRepository } from "./user.repository";
import { UserSettingsEntity } from "./user.schema";

const PROFILE_ID_PATTERN = /^[0-9a-f]{24}$/i;
const USER_CACHE_TTL_MS = 60_000;
const SIGN_IN_CACHE_TTL_MS = 10 * 60_000;

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly appCache: AppCacheService,
    private readonly identity: AccountIdentityService,
    private readonly discordNameSync: DiscordNameSyncService,
    private readonly signIns: UserSignInRepository,
  ) {}

  private readonly signInEpochs = new Map<string, number>();

  async namesFor(
    accountIds: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, PersonNames>> {
    const unique = [
      ...new Set(
        accountIds.filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];
    if (unique.length === 0) return new Map();
    return this.userRepository.findNamesByAccounts(unique);
  }

  async profileIdsFor(
    accountIds: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const names = await this.namesFor(accountIds);
    const profileIds = new Map<string, string>();
    for (const [accountId, person] of names) {
      profileIds.set(accountId, person.profileId);
    }
    return profileIds;
  }

  async findPublicCard(profileId: unknown): Promise<PublicCard> {
    if (typeof profileId !== "string" || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND);
    }
    const card = await this.userRepository.findPublicCardById(profileId);
    if (!card) throw new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND);
    return card;
  }

  async resetDisplayName(
    profileId: unknown,
  ): Promise<{ accountId: string; profileId: string; displayName: string }> {
    if (typeof profileId !== "string" || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND);
    }
    const accountId = await this.userRepository.profileOwnerSub(profileId);
    if (!accountId) throw new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND);

    const displayName = randomCoachName();
    await this.userRepository.applyChanges(accountId, {
      set: { displayName },
    });
    await this.appCache.invalidate(CacheKeys.user(accountId));
    return { accountId, profileId, displayName };
  }

  async claimSignUpDiscordName(
    sub: string,
    submitted: string | undefined,
  ): Promise<string> {
    const user = await this.getOrCreateMe(sub);
    const stored = user.profile?.discordName;
    if (stored) return stored;

    const trimmed = submitted?.trim() ?? "";
    if (trimmed === "") {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "discordName",
      });
    }
    await this.updateProfile(sub, { discordName: trimmed });
    return trimmed;
  }

  async resolveAccount(signIn: string): Promise<string> {
    if (!this.identity.internal) return signIn;
    return await this.appCache.getOrSet(
      CacheKeys.signIn(signIn),
      SIGN_IN_CACHE_TTL_MS,
      async () => {
        for (;;) {
          const epoch = this.signInEpochs.get(signIn) ?? 0;
          const accountId = await this.reachAccount(signIn);
          if ((this.signInEpochs.get(signIn) ?? 0) === epoch) return accountId;
        }
      },
    );
  }

  async invalidateSignIn(
    signIn: string,
    ...accountIds: string[]
  ): Promise<void> {
    this.signInEpochs.set(signIn, (this.signInEpochs.get(signIn) ?? 0) + 1);
    await this.appCache.invalidate(
      CacheKeys.signIn(signIn),
      ...accountIds.map((accountId) => CacheKeys.user(accountId)),
    );
  }

  private async reachAccount(signIn: string): Promise<string> {
    const row = await this.signIns.find(signIn);
    if (row?.blocked) throw new PDZError(ErrorCodes.USER.SIGN_IN_BLOCKED);
    if (row && (await this.userRepository.accountExists(row.accountId))) {
      return row.accountId;
    }
    return this.userRepository.resolveAccountId(signIn, new Date());
  }

  async getSettings(sub: string): Promise<UserSettings> {
    const user = await this.getOrCreateMe(sub);
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
    if (this.identity.internal) {
      const signIn = user.signIn ?? user.sub;
      const row = await this.signIns.find(signIn);
      if (row?.blocked) return null;
      if (row) {
        const target = await this.userRepository.touchAccount(
          row.accountId,
          user.lastLogin,
        );
        if (target) {
          await this.appCache.invalidate(
            CacheKeys.user(row.accountId),
            CacheKeys.signIn(signIn),
          );
          return target;
        }
      }
    }
    const updatedUserDoc = await this.userRepository.updateUser(user);
    const accountId = this.identity.internal
      ? String(updatedUserDoc._id)
      : user.sub;
    await this.appCache.invalidate(
      CacheKeys.user(accountId),
      CacheKeys.signIn(user.signIn ?? user.sub),
    );
    return updatedUserDoc;
  }

  async getMe(sub: string): Promise<User> {
    return await this.appCache.getOrSet(
      CacheKeys.user(sub),
      USER_CACHE_TTL_MS,
      () => this.userRepository.getUserBySub(sub),
    );
  }

  async getOrCreateMe(sub: string): Promise<User> {
    return await this.appCache.getOrSet(
      CacheKeys.user(sub),
      USER_CACHE_TTL_MS,
      () => this.userRepository.getOrCreateUserBySub(sub, new Date()),
    );
  }

  async updateProfile(sub: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.getOrCreateUserBySub(
      sub,
      new Date(),
    );
    const set: Record<string, unknown> = {};
    const unset: string[] = [];

    if (dto.displayName !== undefined) {
      const trimmed = dto.displayName?.trim() ?? "";
      if (trimmed === "") {
        throw new PDZError(ErrorCodes.USER.INVALID_DISPLAY_NAME, {
          reason: "A display name can't be removed",
        });
      } else {
        const displayName = normalizeDisplayName(trimmed);
        if (displayName === null) {
          throw new PDZError(ErrorCodes.USER.INVALID_DISPLAY_NAME);
        }
        set.displayName = displayName;
      }
    }

    this.applyProfileText(
      "discordName",
      "Discord name",
      DISCORD_NAME_MAX,
      dto.discordName,
      set,
      unset,
    );
    this.applyProfileText(
      "gameName",
      "Game name",
      GAME_NAME_MAX,
      dto.gameName,
      set,
      unset,
    );

    if (dto.timezone !== undefined) {
      const timezone = dto.timezone?.trim() ?? "";
      if (timezone === "") {
        unset.push("profile.timezone");
      } else if (isValidTimeZone(timezone)) {
        set["profile.timezone"] = timezone;
      } else {
        throw new PDZError(ErrorCodes.USER.INVALID_PROFILE, {
          reason: "That is not a valid time zone",
        });
      }
    }

    if (dto.privateProfile !== undefined) {
      set.privateProfile = dto.privateProfile;
    }

    if (Object.keys(set).length === 0 && unset.length === 0) return user;

    const updated = await this.userRepository.applyChanges(sub, {
      set,
      unset,
    });
    await this.appCache.invalidate(CacheKeys.user(sub));

    const discordName = set["profile.discordName"];
    if (typeof discordName === "string") {
      await this.discordNameSync.propagateToRunningSignUps(sub, discordName);
    }
    return updated;
  }

  private applyProfileText(
    field: "discordName" | "gameName",
    label: string,
    max: number,
    value: string | null | undefined,
    set: Record<string, unknown>,
    unset: string[],
  ): void {
    if (value === undefined) return;
    const trimmed = value?.trim() ?? "";
    if (trimmed === "") {
      unset.push(`profile.${field}`);
      return;
    }
    if ([...trimmed].length > max) {
      throw new PDZError(ErrorCodes.USER.INVALID_PROFILE, {
        reason: `${label} can be at most ${max} characters`,
      });
    }
    set[`profile.${field}`] = trimmed;
  }
}
