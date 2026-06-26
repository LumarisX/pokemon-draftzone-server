import { Auth0UserDto } from "@modules/user/user.dto";
import { UserService } from "@modules/user/user.service";
import { WebhookController } from "./webhook.controller";

describe("WebhookController", () => {
  let service: jest.Mocked<UserService>;
  let controller: WebhookController;

  beforeEach(() => {
    service = {
      syncUser: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    controller = new WebhookController(service);
  });

  it("maps the Auth0 payload to a User and forwards it to syncUser", async () => {
    const data: Auth0UserDto = {
      auth0Sub: "auth0|coach-1",
      lastLogin: "2026-01-01T00:00:00.000Z",
      joined: "2025-01-01T00:00:00.000Z",
      settings: {},
      username: "coach1",
      emailVerified: true,
    };
    const syncedUser = { sub: "auth0|coach-1" } as any;
    service.syncUser.mockResolvedValue(syncedUser);

    const result = await controller.syncUser(data);

    expect(service.syncUser).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "auth0|coach-1" }),
    );
    expect(result).toBe(syncedUser);
  });
});
