import { UserController } from "./user.controller";
import { User } from "./user.domain";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProfileDto, UserSettingsDto } from "./user.dto";
import { UserService } from "./user.service";

describe("UserController", () => {
  let service: jest.Mocked<UserService>;
  let controller: UserController;

  beforeEach(() => {
    service = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      syncUser: jest.fn(),
      getMe: jest.fn(),
      getOrCreateMe: jest.fn(),
      updateProfile: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    controller = new UserController(service);
  });

  it("getSettings forwards the authenticated sub", async () => {
    const settings = { theme: "dark" } as any;
    service.getSettings.mockResolvedValue(settings);

    const result = await controller.getSettings("auth0|user-1");

    expect(service.getSettings).toHaveBeenCalledWith("auth0|user-1");
    expect(result).toBe(settings);
  });

  it("updateSettings forwards the sub and body", async () => {
    const body = { theme: "dark" } as UserSettingsDto;
    const updated = { theme: "dark" } as any;
    service.updateSettings.mockResolvedValue(updated);

    const result = await controller.updateSettings("auth0|user-1", body);

    expect(service.updateSettings).toHaveBeenCalledWith("auth0|user-1", body);
    expect(result).toBe(updated);
  });

  function buildUser(): User {
    return new User({
      sub: "auth0|user-1",
      joined: new Date("2026-01-01"),
      lastLogin: new Date("2026-02-01"),
      username: "Provider Name",
      profileId: "0123456789abcdef01234567",
      displayName: "Ash",
    });
  }

  it("getMe gets or creates the user and returns the client payload", async () => {
    service.getOrCreateMe.mockResolvedValue(buildUser());

    const result: any = await controller.getMe("auth0|user-1");

    expect(service.getOrCreateMe).toHaveBeenCalledWith("auth0|user-1");
    expect(service.getMe).not.toHaveBeenCalled();
    expect(result.profileId).toBe("0123456789abcdef01234567");
    expect(result.displayName).toBe("Ash");
    expect(result).not.toHaveProperty("username");
    expect(result).not.toHaveProperty("handle");
  });

  it("no longer serves the handle routes", () => {
    expect(
      (UserController.prototype as unknown as Record<string, unknown>)
        .checkHandle,
    ).toBeUndefined();
    expect(
      (UserController.prototype as unknown as Record<string, unknown>)
        .setHandle,
    ).toBeUndefined();
  });

  it("updateProfile returns the client payload", async () => {
    service.updateProfile.mockResolvedValue(buildUser());
    const body: UpdateProfileDto = { gameName: "AshK" };

    const result: any = await controller.updateProfile("auth0|user-1", body);

    expect(service.updateProfile).toHaveBeenCalledWith("auth0|user-1", body);
    expect(result.sub).toBe("auth0|user-1");
  });

  it("updateProfile returns privateProfile in the me payload", async () => {
    service.updateProfile.mockResolvedValue(
      new User({
        sub: "auth0|user-1",
        joined: new Date("2026-01-01"),
        lastLogin: new Date("2026-02-01"),
        privateProfile: true,
      }),
    );

    const result: any = await controller.updateProfile("auth0|user-1", {
      privateProfile: true,
    });

    expect(service.updateProfile).toHaveBeenCalledWith("auth0|user-1", {
      privateProfile: true,
    });
    expect(result.privateProfile).toBe(true);
  });

  it.each([
    [{ privateProfile: true }, 0],
    [{ privateProfile: false }, 0],
    [{}, 0],
    [{ privateProfile: "yes" }, 1],
  ])("validates the profile body %j", async (body, errors) => {
    const dto = plainToInstance(UpdateProfileDto, body);

    expect(await validate(dto)).toHaveLength(errors);
  });

});
