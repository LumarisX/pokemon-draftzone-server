import { AppCacheService } from "@core/cache/app-cache.service";
import { createCache } from "cache-manager";
import { User, UserSettings } from "./user.domain";
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
  let service: UserService;

  beforeEach(() => {
    userRepo = {
      getUserBySub: jest.fn(),
      updateSettings: jest.fn(),
      updateUser: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    service = new UserService(userRepo, new AppCacheService(createCache()));
  });

  describe("getSettings", () => {
    it("returns the user's settings when present", async () => {
      const settings = new UserSettings({ theme: "dark" });
      userRepo.getUserBySub.mockResolvedValue(buildUser({ settings }));

      const result = await service.getSettings("auth0|user-1");

      expect(userRepo.getUserBySub).toHaveBeenCalledWith("auth0|user-1");
      expect(result).toBe(settings);
    });

    it("defaults to an empty object when the user has no settings", async () => {
      userRepo.getUserBySub.mockResolvedValue(buildUser({ settings: undefined }));

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

      // getMe (miss), updateSettings' own read, then getMe again post-invalidation
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
  });
});
