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
    service = new UserService(userRepo);
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
  });

  describe("getMe", () => {
    it("delegates to the repository", async () => {
      const user = buildUser();
      userRepo.getUserBySub.mockResolvedValue(user);

      const result = await service.getMe("auth0|user-1");

      expect(userRepo.getUserBySub).toHaveBeenCalledWith("auth0|user-1");
      expect(result).toBe(user);
    });
  });
});
