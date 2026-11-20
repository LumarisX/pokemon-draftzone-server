import { AppCacheService } from "@core/cache/app-cache.service";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { createCache } from "cache-manager";
import { AccountIdentityService } from "./account-identity.service";
import { DiscordConnectService } from "./discord-connect.service";
import { User, UserProfile, UserSettings } from "./user.domain";
import { UserSignInRepository } from "./user-sign-in.repository";
import { UserSettingsDto } from "./user.dto";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}): User {
  return new User({
    sub: "auth0|user-1",
    joined: new Date("2026-01-01"),
    lastLogin: new Date("2026-02-01"),
    ...overrides,
  });
}

describe("UserService", () => {
  let userRepo: jest.Mocked<UserRepository>;
  let discordConnect: jest.Mocked<DiscordConnectService>;
  let service: UserService;

  beforeEach(() => {
    userRepo = {
      getUserBySub: jest.fn(),
      updateSettings: jest.fn(),
      updateUser: jest.fn(),
      getOrCreateUserBySub: jest.fn(),
      applyChanges: jest.fn(),
      profileOwnerSub: jest.fn().mockResolvedValue(null),
      findPublicCardById: jest.fn().mockResolvedValue(null),
      findNamesByAccounts: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<UserRepository>;
    discordConnect = {
      reconcile: jest.fn(async (_sub: string, user: User) => user),
    } as unknown as jest.Mocked<DiscordConnectService>;
    service = new UserService(
      userRepo,
      new AppCacheService(createCache()),
      new AccountIdentityService({ get: () => undefined } as any),
      {} as UserSignInRepository,
      discordConnect,
    );
  });

  describe("claimSignUpDiscord", () => {
    const connected = {
      id: "123456789012345678",
      username: "ash",
      connectedAt: new Date("2026-11-01"),
      refreshedAt: new Date("2026-11-01"),
    };

    it("stores the connected Discord name and id", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ discord: connected }),
      );

      const claimed = await service.claimSignUpDiscord("auth0|user-1", true);

      expect(claimed).toEqual({
        discordName: "ash",
        discordId: "123456789012345678",
      });
      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });

    it("refuses a sign-up that requires Discord when none is connected", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ profile: new UserProfile({ discordName: "typed#1" }) }),
      );

      await expect(
        service.claimSignUpDiscord("auth0|user-1", true),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_REQUIRED.code,
        status: 403,
      });
    });

    it("stores no Discord name for an unconnected account when Discord is not required, even with a stored profile name", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ profile: new UserProfile({ discordName: "typed#1" }) }),
      );

      const claimed = await service.claimSignUpDiscord("auth0|user-1", false);

      expect(claimed).toEqual({});
    });
  });

  describe("updateProfile and Discord names", () => {
    beforeEach(() => {
      userRepo.applyChanges.mockResolvedValue(buildUser());
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());
    });

    it("ignores a Discord name sent in the profile", async () => {
      await service.updateProfile("auth0|user-1", {
        discordName: "typed#2",
      } as any);

      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });
  });

  describe("getSettings", () => {
    it("returns the user's settings when present", async () => {
      const settings = new UserSettings({ theme: "dark" });
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser({ settings }));

      const result = await service.getSettings("auth0|user-1");

      expect(userRepo.getOrCreateUserBySub).toHaveBeenCalledWith(
        "auth0|user-1",
        expect.any(Date),
      );
      expect(result).toBe(settings);
    });

    it("defaults to an empty object when the user has no settings", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ settings: undefined }),
      );

      const result = await service.getSettings("auth0|user-1");

      expect(result).toEqual({});
    });
  });

  describe("updateSettings", () => {
    it("merges the existing settings with the submitted fields", async () => {
      const existingSettings = new UserSettings({ theme: "dark", spriteSet: "showdown" });
      userRepo.getUserBySub.mockResolvedValue(buildUser({ settings: existingSettings }));
      const updatedDoc = { settings: { theme: "classic", spriteSet: "showdown" } } as any;
      userRepo.updateSettings.mockResolvedValue(updatedDoc);
      const dto: UserSettingsDto = { theme: "classic" };

      const result = await service.updateSettings("auth0|user-1", dto);

      expect(userRepo.updateSettings).toHaveBeenCalledWith("auth0|user-1", {
        theme: "classic",
        spriteSet: "showdown",
      });
      expect(result).toBe(updatedDoc.settings);
    });

    it("works when the user previously had no settings at all", async () => {
      userRepo.getUserBySub.mockResolvedValue(buildUser({ settings: undefined }));
      userRepo.updateSettings.mockResolvedValue({ settings: { theme: "dark" } } as any);
      const dto: UserSettingsDto = { theme: "dark" };

      await service.updateSettings("auth0|user-1", dto);

      expect(userRepo.updateSettings).toHaveBeenCalledWith("auth0|user-1", {
        theme: "dark",
      });
    });

    it("invalidates the cached user so the next read is fresh", async () => {
      userRepo.getUserBySub.mockResolvedValue(
        buildUser({ settings: new UserSettings({ theme: "dark" }) }),
      );
      userRepo.updateSettings.mockResolvedValue({ settings: { theme: "classic" } } as any);

      await service.getMe("auth0|user-1");
      await service.updateSettings("auth0|user-1", { theme: "classic" });
      await service.getMe("auth0|user-1");

      expect(userRepo.getUserBySub).toHaveBeenCalledTimes(3);
    });
  });

  describe("syncUser", () => {
    it("delegates to the repository", async () => {
      const user = buildUser();
      const updatedDoc = {} as any;
      userRepo.updateUser.mockResolvedValue(updatedDoc);

      const result = await service.syncUser(user);

      expect(userRepo.updateUser).toHaveBeenCalledWith(user);
      expect(result).toBe(updatedDoc);
    });

    it("invalidates the cached user so the next read is fresh", async () => {
      const user = buildUser();
      userRepo.getUserBySub.mockResolvedValue(user);
      userRepo.updateUser.mockResolvedValue({} as any);

      await service.getMe(user.sub);
      await service.syncUser(user);
      await service.getMe(user.sub);

      expect(userRepo.getUserBySub).toHaveBeenCalledTimes(2);
    });
  });

  describe("getMe", () => {
    it("delegates to the repository", async () => {
      const user = buildUser();
      userRepo.getUserBySub.mockResolvedValue(user);

      const result = await service.getMe("auth0|user-1");

      expect(userRepo.getUserBySub).toHaveBeenCalledWith("auth0|user-1");
      expect(result).toBe(user);
    });

    it("serves repeated reads from the cache", async () => {
      const user = buildUser();
      userRepo.getUserBySub.mockResolvedValue(user);

      await service.getMe("auth0|user-1");
      const second = await service.getMe("auth0|user-1");

      expect(second).toBe(user);
      expect(userRepo.getUserBySub).toHaveBeenCalledTimes(1);
    });

    it("caches users independently per sub", async () => {
      userRepo.getUserBySub.mockImplementation(async (sub) => buildUser({ sub }));

      await service.getMe("auth0|user-1");
      await service.getMe("auth0|user-2");

      expect(userRepo.getUserBySub).toHaveBeenCalledTimes(2);
    });

    it("still throws USER.NOT_FOUND for a missing user", async () => {
      userRepo.getUserBySub.mockRejectedValue(
        new PDZError(ErrorCodes.USER.NOT_FOUND),
      );

      await expect(service.getMe("auth0|nobody")).rejects.toMatchObject({
        code: ErrorCodes.USER.NOT_FOUND.code,
      });
      expect(userRepo.getOrCreateUserBySub).not.toHaveBeenCalled();
    });
  });

  describe("getOrCreateMe", () => {
    it("creates the user through the repository when missing", async () => {
      const user = buildUser();
      userRepo.getOrCreateUserBySub.mockResolvedValue(user);

      const result = await service.getOrCreateMe("auth0|user-1");

      expect(userRepo.getOrCreateUserBySub).toHaveBeenCalledWith(
        "auth0|user-1",
        expect.any(Date),
      );
      expect(result).toBe(user);
      expect(userRepo.getUserBySub).not.toHaveBeenCalled();
    });

    it("serves repeated reads from the cache", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.getOrCreateMe("auth0|user-1");
      await service.getOrCreateMe("auth0|user-1");

      expect(userRepo.getOrCreateUserBySub).toHaveBeenCalledTimes(1);
    });
  });

  describe("profileIdsFor", () => {
    it("asks once for the de-duplicated ids and maps each account to its profile id", async () => {
      userRepo.findNamesByAccounts.mockResolvedValue(
        new Map([
          ["a", { profileId: "p-a", displayName: "Ash", username: null }],
          ["b", { profileId: "p-b", displayName: null, username: null }],
        ]),
      );

      const ids = await service.profileIdsFor(["a", "b", "a", undefined, null, ""]);

      expect(userRepo.findNamesByAccounts).toHaveBeenCalledTimes(1);
      expect(userRepo.findNamesByAccounts).toHaveBeenCalledWith(["a", "b"]);
      expect([...ids]).toEqual([
        ["a", "p-a"],
        ["b", "p-b"],
      ]);
    });

    it("omits accounts that have no row", async () => {
      userRepo.findNamesByAccounts.mockResolvedValue(
        new Map([["a", { profileId: "p-a", displayName: null, username: null }]]),
      );

      const ids = await service.profileIdsFor(["a", "ghost"]);

      expect(ids.has("ghost")).toBe(false);
    });

    it("skips the query when there is nobody to look up", async () => {
      expect((await service.profileIdsFor([undefined])).size).toBe(0);
      expect(userRepo.findNamesByAccounts).not.toHaveBeenCalled();
    });
  });

  describe("resetDisplayName", () => {
    const PROFILE_ID = "0123456789abcdef01234567";

    it("sets Coach and four digits and clears the cache", async () => {
      userRepo.profileOwnerSub.mockResolvedValue("auth0|target");
      userRepo.applyChanges.mockResolvedValue(buildUser());
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());
      await service.getOrCreateMe("auth0|target");

      const result = await service.resetDisplayName(PROFILE_ID);

      expect(result).toEqual({
        accountId: "auth0|target",
        profileId: PROFILE_ID,
        displayName: expect.stringMatching(/^Coach \d{4}$/),
      });
      expect(userRepo.profileOwnerSub).toHaveBeenCalledWith(PROFILE_ID);
      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|target", {
        set: { displayName: result.displayName },
      });
      await service.getOrCreateMe("auth0|target");
      expect(userRepo.getOrCreateUserBySub).toHaveBeenCalledTimes(2);
    });

    it("answers 404 for an unknown profile id and changes nothing", async () => {
      userRepo.profileOwnerSub.mockResolvedValue(null);

      await expect(service.resetDisplayName(PROFILE_ID)).rejects.toMatchObject({
        code: ErrorCodes.USER.ACCOUNT_NOT_FOUND.code,
        status: 404,
      });
      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });

    it.each(["", "ash", "x".repeat(80), 42, undefined])(
      "answers 404 for the malformed profile id %j without a lookup",
      async (raw) => {
        await expect(service.resetDisplayName(raw)).rejects.toMatchObject({
          code: ErrorCodes.USER.ACCOUNT_NOT_FOUND.code,
        });
        expect(userRepo.profileOwnerSub).not.toHaveBeenCalled();
      },
    );
  });

  describe("findPublicCard", () => {
    const PROFILE_ID = "0123456789abcdef01234567";
    const card = {
      accountId: "acct-1",
      profileId: PROFILE_ID,
      displayName: "Ash",
      username: "Ash",
      joined: new Date("2026-01-01"),
      privateProfile: false,
    };

    it("looks the profile id up as given", async () => {
      userRepo.findPublicCardById.mockResolvedValue(card);

      await expect(service.findPublicCard(PROFILE_ID)).resolves.toBe(card);
      expect(userRepo.findPublicCardById).toHaveBeenCalledWith(PROFILE_ID);
    });

    it("accepts an upper-case ObjectId", async () => {
      userRepo.findPublicCardById.mockResolvedValue(card);

      await expect(
        service.findPublicCard(PROFILE_ID.toUpperCase()),
      ).resolves.toBe(card);
    });

    it("answers account not found for an unknown profile id", async () => {
      userRepo.findPublicCardById.mockResolvedValue(null);

      await expect(service.findPublicCard(PROFILE_ID)).rejects.toMatchObject({
        code: ErrorCodes.USER.ACCOUNT_NOT_FOUND.code,
        status: 404,
      });
    });

    it.each([
      "",
      "ash",
      "0123456789abcdef0123456",
      "0123456789abcdef012345678",
      "0123456789abcdef0123456g",
      " 0123456789abcdef01234567",
      "x".repeat(80),
      42,
      undefined,
    ])(
      "answers account not found for the malformed id %j without a lookup",
      async (raw) => {
        await expect(service.findPublicCard(raw)).rejects.toMatchObject({
          code: ErrorCodes.USER.ACCOUNT_NOT_FOUND.code,
          status: 404,
        });
        expect(userRepo.findPublicCardById).not.toHaveBeenCalled();
      },
    );
  });

  describe("updateProfile", () => {
    beforeEach(() => {
      userRepo.applyChanges.mockResolvedValue(buildUser());
    });

    it("saves trimmed profile fields under profile.*", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.updateProfile("auth0|user-1", {
        gameName: "AshK",
        timezone: "America/New_York",
      });

      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|user-1", {
        set: {
          "profile.gameName": "AshK",
          "profile.timezone": "America/New_York",
        },
        unset: [],
      });
    });

    it.each([true, false])("saves privateProfile %s", async (value) => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.updateProfile("auth0|user-1", { privateProfile: value });

      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|user-1", {
        set: { privateProfile: value },
        unset: [],
      });
    });

    it("accepts UTC as a time zone", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.updateProfile("auth0|user-1", { timezone: "UTC" });

      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|user-1", {
        set: { "profile.timezone": "UTC" },
        unset: [],
      });
    });

    it("rejects an unknown time zone", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await expect(
        service.updateProfile("auth0|user-1", { timezone: "Mars/Olympus" }),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.INVALID_PROFILE.code });
    });

    it("rejects an over-long game name", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await expect(
        service.updateProfile("auth0|user-1", { gameName: "x".repeat(33) }),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.INVALID_PROFILE.code });
      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });

    it("clears a field sent as null or an empty string", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.updateProfile("auth0|user-1", {
        gameName: "  ",
        timezone: "",
      });

      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|user-1", {
        set: {},
        unset: ["profile.gameName", "profile.timezone"],
      });
    });

    it("validates and saves the display name", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.updateProfile("auth0|user-1", { displayName: " Ash K " });

      expect(userRepo.applyChanges).toHaveBeenCalledWith("auth0|user-1", {
        set: { displayName: "Ash K" },
        unset: [],
      });
    });

    it("rejects an invalid display name", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await expect(
        service.updateProfile("auth0|user-1", { displayName: "A" }),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.INVALID_DISPLAY_NAME.code,
      });
    });

    it("refuses to clear the display name", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ displayName: "Ash" }),
      );

      await expect(
        service.updateProfile("auth0|user-1", { displayName: null }),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.INVALID_DISPLAY_NAME.code,
      });
      await expect(
        service.updateProfile("auth0|user-1", { displayName: "" }),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.INVALID_DISPLAY_NAME.code,
      });
      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });

    it("writes nothing when no field is present", async () => {
      const current = buildUser();
      userRepo.getOrCreateUserBySub.mockResolvedValue(current);

      const result = await service.updateProfile("auth0|user-1", {});

      expect(result).toBe(current);
      expect(userRepo.applyChanges).not.toHaveBeenCalled();
    });

    it("invalidates the cached user after a write", async () => {
      userRepo.getOrCreateUserBySub.mockResolvedValue(buildUser());

      await service.getOrCreateMe("auth0|user-1");
      await service.updateProfile("auth0|user-1", { gameName: "AshK" });
      await service.getOrCreateMe("auth0|user-1");

      expect(userRepo.getOrCreateUserBySub).toHaveBeenCalledTimes(3);
    });
  });
});
