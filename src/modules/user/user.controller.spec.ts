import { UserController } from "./user.controller";
import { UserSettingsDto } from "./user.dto";
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

  it("getMe forwards the authenticated sub", async () => {
    const user = { sub: "auth0|user-1" } as any;
    service.getMe.mockResolvedValue(user);

    const result = await controller.getMe("auth0|user-1");

    expect(service.getMe).toHaveBeenCalledWith("auth0|user-1");
    expect(result).toBe(user);
  });
});
