import { Auth0UserDto } from "@modules/user/user.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
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

  it("forwards a payload that has no username, settings or emailVerified", async () => {
    const data: Auth0UserDto = {
      auth0Sub: "google-oauth2|1",
      lastLogin: "2026-01-01T00:00:00.000Z",
      joined: "2025-01-01T00:00:00.000Z",
    };
    service.syncUser.mockResolvedValue({} as any);

    await controller.syncUser(data);

    const forwarded = service.syncUser.mock.calls[0][0];
    expect(forwarded.sub).toBe("google-oauth2|1");
    expect(forwarded.username).toBeUndefined();
  });
});

describe("Auth0UserDto validation", () => {
  it("accepts a payload without username, settings or emailVerified", async () => {
    const dto = plainToInstance(Auth0UserDto, {
      auth0Sub: "google-oauth2|1",
      lastLogin: "2026-01-01T00:00:00.000Z",
      joined: "2025-01-01T00:00:00.000Z",
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it("still requires the sub and the timestamps", async () => {
    const dto = plainToInstance(Auth0UserDto, {});

    const properties = (await validate(dto)).map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(["auth0Sub", "lastLogin", "joined"]),
    );
  });
});
