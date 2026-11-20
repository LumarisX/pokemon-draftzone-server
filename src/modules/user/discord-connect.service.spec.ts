import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { ErrorCodes } from "@core/pdz-error-codes";
import { DiscordService } from "@modules/discord/discord.service";
import { ConfigService } from "@nestjs/config";
import { createCache } from "cache-manager";
import { DiscordConnectService, safeReturnTo } from "./discord-connect.service";
import { AccountMergeOfferService } from "./account-merge-offer.service";
import { DiscordNameSyncService } from "./discord-name-sync.service";
import { User, UserProfile } from "./user.domain";
import { UserMapper } from "./user.mapper";
import { UserRepository } from "./user.repository";

const ACCOUNT = "google-oauth2|1";
const DISCORD_ID = "123456789012345678";
const CONFIG: Record<string, string> = {
  DISCORD_CLIENT_ID: "client-1",
  DISCORD_CLIENT_SECRET: "secret-1",
  DISCORD_OAUTH_REDIRECT_URI: "http://localhost:4200/settings/discord",
};

function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}) {
  return new User({
    sub: ACCOUNT,
    signIn: ACCOUNT,
    joined: new Date("2026-01-01"),
    lastLogin: new Date("2026-02-01"),
    ...overrides,
  });
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("DiscordConnectService", () => {
  let repo: jest.Mocked<
    Pick<
      UserRepository,
      "getOrCreateUserBySub" | "applyChanges" | "findDiscordHolder"
    >
  >;
  let cache: AppCacheService;
  let offers: { create: jest.Mock };
  let discordService: { fetchUser: jest.Mock };
  let sync: {
    propagateToRunningSignUps: jest.Mock;
    clearRunningDiscordIds: jest.Mock;
  };
  let config: Record<string, string>;
  let service: DiscordConnectService;
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  function stateFrom(url: string): string {
    return new URL(url).searchParams.get("state") as string;
  }

  beforeEach(() => {
    config = { ...CONFIG };
    repo = {
      getOrCreateUserBySub: jest.fn().mockResolvedValue(buildUser()),
      applyChanges: jest.fn().mockImplementation(async (_sub, changes) =>
        buildUser({
          discord: changes.set?.discord,
          profile: new UserProfile({
            discordName: changes.set?.["profile.discordName"],
          }),
        }),
      ),
      findDiscordHolder: jest.fn().mockResolvedValue(null),
    };
    cache = new AppCacheService(createCache());
    offers = { create: jest.fn().mockResolvedValue(null) };
    discordService = { fetchUser: jest.fn().mockResolvedValue(null) };
    sync = {
      propagateToRunningSignUps: jest
        .fn()
        .mockResolvedValue({ coaches: 0, applications: 0 }),
      clearRunningDiscordIds: jest
        .fn()
        .mockResolvedValue({ coaches: 0, applications: 0 }),
    };
    service = new DiscordConnectService(
      repo as unknown as UserRepository,
      cache,
      { get: (key: string) => config[key] } as unknown as ConfigService,
      discordService as unknown as DiscordService,
      sync as unknown as DiscordNameSyncService,
      offers as unknown as AccountMergeOfferService,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  describe("safeReturnTo", () => {
    it.each([
      ["/settings", "/settings"],
      ["/leagues/a/tournaments/b/sign-up?x=1", "/leagues/a/tournaments/b/sign-up?x=1"],
      ["//evil.example", "/settings"],
      ["https://evil.example", "/settings"],
      ["/\\evil.example", "/settings"],
      ["settings", "/settings"],
      ["", "/settings"],
      [undefined, "/settings"],
      [42, "/settings"],
    ])("reads %p as %p", (value, expected) => {
      expect(safeReturnTo(value)).toBe(expected);
    });
  });

  describe("startConnect", () => {
    it("returns Discord's authorize address with a one-time state", async () => {
      const { url } = await service.startConnect(ACCOUNT, "/leagues/a");
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        "https://discord.com/oauth2/authorize",
      );
      expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
        response_type: "code",
        scope: "identify",
        client_id: "client-1",
        redirect_uri: "http://localhost:4200/settings/discord",
        prompt: "consent",
      });
      expect(stateFrom(url).length).toBeGreaterThan(20);
    });

    it("makes a different state each time", async () => {
      const first = await service.startConnect(ACCOUNT);
      const second = await service.startConnect(ACCOUNT);

      expect(stateFrom(first.url)).not.toBe(stateFrom(second.url));
    });

    it("fails with DISCORD_NOT_CONFIGURED when a setting is missing", async () => {
      delete config.DISCORD_CLIENT_SECRET;

      await expect(service.startConnect(ACCOUNT)).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_NOT_CONFIGURED.code,
        status: 503,
      });
    });

    it("refuses an account that signs in with Discord", async () => {
      repo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ sub: `oauth2|discord|${DISCORD_ID}`, signIn: `oauth2|discord|${DISCORD_ID}` }),
      );

      await expect(service.startConnect(ACCOUNT)).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_ALREADY_CONNECTED.code,
        status: 409,
      });
    });
  });

  describe("completeConnect", () => {
    function approveDiscord(id = DISCORD_ID, username = "ash") {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
        .mockResolvedValueOnce(
          jsonResponse({ id, username, email: "x@y.z", avatar: "a" }),
        );
    }

    it("saves the id and username, then syncs running sign-ups with both", async () => {
      const { url } = await service.startConnect(ACCOUNT, "/leagues/a/sign-up");
      approveDiscord();

      const result = await service.completeConnect(ACCOUNT, "code-1", stateFrom(url));

      expect(result.returnTo).toBe("/leagues/a/sign-up");
      expect(repo.applyChanges).toHaveBeenCalledWith(ACCOUNT, {
        set: {
          discord: {
            id: DISCORD_ID,
            username: "ash",
            connectedAt: expect.any(Date),
            refreshedAt: expect.any(Date),
          },
        },
      });
      expect(sync.propagateToRunningSignUps).toHaveBeenCalledWith(
        ACCOUNT,
        "ash",
        DISCORD_ID,
      );
      const payload = UserMapper.toClientPayload(result.user);
      expect(payload.discord).toEqual({
        id: DISCORD_ID,
        username: "ash",
        connectedAt: expect.any(String),
        viaSignIn: false,
      });
    });

    it("sends the code to Discord and keeps nothing but id and username", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      approveDiscord();

      await service.completeConnect(ACCOUNT, "code-1", stateFrom(url));

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe("https://discord.com/api/oauth2/token");
      const body = new URLSearchParams(tokenInit.body as string);
      expect(body.get("code")).toBe("code-1");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_secret")).toBe("secret-1");
      const [meUrl, meInit] = fetchMock.mock.calls[1];
      expect(meUrl).toBe("https://discord.com/api/users/@me");
      expect(meInit.headers.Authorization).toBe("Bearer tok");
      const saved = repo.applyChanges.mock.calls[0][1].set as Record<string, unknown>;
      expect(Object.keys(saved.discord as object).sort()).toEqual([
        "connectedAt",
        "id",
        "refreshedAt",
        "username",
      ]);
    });

    it("rejects a state made for another account and consumes it", async () => {
      const { url } = await service.startConnect("auth0|someone-else");
      const state = stateFrom(url);

      await expect(
        service.completeConnect(ACCOUNT, "code-1", state),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_STATE_INVALID.code,
        status: 400,
      });
      await expect(
        service.completeConnect("auth0|someone-else", "code-1", state),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_STATE_INVALID.code });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a state that was already used", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      const state = stateFrom(url);
      approveDiscord();
      await service.completeConnect(ACCOUNT, "code-1", state);

      await expect(
        service.completeConnect(ACCOUNT, "code-1", state),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_STATE_INVALID.code });
    });

    it("rejects a state that expired", async () => {
      await cache.set(
        CacheKeys.discordState("old-state"),
        { accountId: ACCOUNT, returnTo: "/settings" },
        5,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));

      await expect(
        service.completeConnect(ACCOUNT, "code-1", "old-state"),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_STATE_INVALID.code });
    });

    it("rejects a state nobody made", async () => {
      await expect(
        service.completeConnect(ACCOUNT, "code-1", "never-issued"),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_STATE_INVALID.code });
    });

    it("fails with DISCORD_EXCHANGE_FAILED when Discord refuses the code", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));

      await expect(
        service.completeConnect(ACCOUNT, "bad", stateFrom(url)),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_EXCHANGE_FAILED.code,
        status: 502,
      });
      expect(repo.applyChanges).not.toHaveBeenCalled();
    });

    it("fails with DISCORD_EXCHANGE_FAILED when reading the profile fails", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
        .mockRejectedValueOnce(new Error("network"));

      await expect(
        service.completeConnect(ACCOUNT, "code-1", stateFrom(url)),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_EXCHANGE_FAILED.code });
    });

    it.each([
      ["oauth2|discord|999999999999999999", "discord"],
      ["google-oauth2|77", "google"],
      ["auth0|abc", "email"],
      ["samlp|corp", "other"],
    ])("refuses a Discord held by %s and says which way in", async (signIn, heldBy) => {
      const { url } = await service.startConnect(ACCOUNT);
      approveDiscord();
      repo.findDiscordHolder.mockResolvedValue({ accountId: "other-account", signIn });

      await expect(
        service.completeConnect(ACCOUNT, "code-1", stateFrom(url)),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_ALREADY_CONNECTED.code,
        status: 409,
        details: { heldBy },
      });
      expect(repo.applyChanges).not.toHaveBeenCalled();
      expect(offers.create).toHaveBeenCalledWith(ACCOUNT, "other-account", DISCORD_ID);
    });

    it("carries the merge offer in the conflict when one is made", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      approveDiscord();
      repo.findDiscordHolder.mockResolvedValue({
        accountId: "other-account",
        signIn: "oauth2|discord|999999999999999999",
      });
      const mergeOffer = { token: "t", blockers: [] };
      offers.create.mockResolvedValue(mergeOffer);

      await expect(
        service.completeConnect(ACCOUNT, "code-1", stateFrom(url)),
      ).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_ALREADY_CONNECTED.code,
        details: { heldBy: "discord", mergeOffer },
      });
    });

    it("leaves mergeOffer out when no offer is made", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      approveDiscord();
      repo.findDiscordHolder.mockResolvedValue({
        accountId: "other-account",
        signIn: "google-oauth2|77",
      });

      const error = await service
        .completeConnect(ACCOUNT, "code-1", stateFrom(url))
        .catch((caught) => caught);

      expect(error.details).toEqual({ heldBy: "google" });
    });

    it("lets an account reconnect the Discord it already holds", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      approveDiscord();
      repo.findDiscordHolder.mockResolvedValue({ accountId: ACCOUNT, signIn: ACCOUNT });

      await service.completeConnect(ACCOUNT, "code-1", stateFrom(url));

      expect(repo.applyChanges).toHaveBeenCalledTimes(1);
    });

    it("refuses an account that signs in with Discord", async () => {
      const { url } = await service.startConnect(ACCOUNT);
      repo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({ signIn: `oauth2|discord|${DISCORD_ID}` }),
      );

      await expect(
        service.completeConnect(ACCOUNT, "code-1", stateFrom(url)),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.DISCORD_ALREADY_CONNECTED.code });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    const connected = {
      id: DISCORD_ID,
      username: "ash",
      connectedAt: new Date("2026-11-01"),
      refreshedAt: new Date("2026-11-01"),
    };

    it("clears discord and drops the ids on running rows, leaving their names", async () => {
      repo.getOrCreateUserBySub.mockResolvedValue(buildUser({ discord: connected }));

      await service.disconnect(ACCOUNT);

      expect(repo.applyChanges).toHaveBeenCalledWith(ACCOUNT, {
        unset: ["discord"],
      });
      expect(sync.clearRunningDiscordIds).toHaveBeenCalledWith(ACCOUNT);
    });

    it("refuses an account that signs in with Discord", async () => {
      repo.getOrCreateUserBySub.mockResolvedValue(
        buildUser({
          signIn: `oauth2|discord|${DISCORD_ID}`,
          discord: connected,
        }),
      );

      await expect(service.disconnect(ACCOUNT)).rejects.toMatchObject({
        code: ErrorCodes.USER.DISCORD_SIGN_IN_CANNOT_DISCONNECT.code,
        status: 400,
      });
      expect(repo.applyChanges).not.toHaveBeenCalled();
    });

    it("does nothing when nothing is connected", async () => {
      await service.disconnect(ACCOUNT);

      expect(repo.applyChanges).not.toHaveBeenCalled();
      expect(sync.clearRunningDiscordIds).not.toHaveBeenCalled();
    });
  });

  describe("reconcile", () => {
    const signInId = `oauth2|discord|${DISCORD_ID}`;

    it("connects a Discord sign-in lazily from the id in its sign-in", async () => {
      const user = buildUser({
        sub: signInId,
        signIn: signInId,
        username: "ash-login",
        profile: new UserProfile({ discordName: "ash-typed" }),
      });

      await service.reconcile(signInId, user);

      expect(repo.applyChanges).toHaveBeenCalledWith(signInId, {
        set: {
          discord: {
            id: DISCORD_ID,
            username: "ash-typed",
            connectedAt: expect.any(Date),
            refreshedAt: new Date(0),
          },
        },
      });
      expect(sync.propagateToRunningSignUps).toHaveBeenCalledWith(
        signInId,
        "ash-typed",
        DISCORD_ID,
      );
    });

    it("falls back to the sign-in username, then the id", async () => {
      await service.reconcile(
        signInId,
        buildUser({ sub: signInId, signIn: signInId, username: "ash-login" }),
      );
      expect(
        (repo.applyChanges.mock.calls[0][1].set as any).discord.username,
      ).toBe("ash-login");

      repo.applyChanges.mockClear();
      await service.reconcile(signInId, buildUser({ sub: signInId, signIn: signInId }));
      expect(
        (repo.applyChanges.mock.calls[0][1].set as any).discord.username,
      ).toBe(DISCORD_ID);
    });

    it("leaves an account alone when another account already holds that Discord", async () => {
      repo.findDiscordHolder.mockResolvedValue({ accountId: "other", signIn: "x" });
      const user = buildUser({ sub: signInId, signIn: signInId });

      const result = await service.reconcile(signInId, user);

      expect(result).toBe(user);
      expect(repo.applyChanges).not.toHaveBeenCalled();
    });

    it("refreshes a stale username through the bot and syncs when it changed", async () => {
      discordService.fetchUser.mockResolvedValue({ id: DISCORD_ID, username: "ash2" });
      const user = buildUser({
        discord: {
          id: DISCORD_ID,
          username: "ash",
          connectedAt: new Date("2026-01-01"),
          refreshedAt: new Date(Date.now() - 25 * 60 * 60_000),
        },
        profile: new UserProfile({ discordName: "ash" }),
      });

      await service.reconcile(ACCOUNT, user);

      expect(discordService.fetchUser).toHaveBeenCalledWith(DISCORD_ID);
      expect(repo.applyChanges).toHaveBeenCalledWith(ACCOUNT, {
        set: {
          "discord.username": "ash2",
          "discord.refreshedAt": expect.any(Date),
        },
      });
      expect(sync.propagateToRunningSignUps).toHaveBeenCalledWith(
        ACCOUNT,
        "ash2",
        DISCORD_ID,
      );
    });

    it("does not ask the bot when the name was refreshed within a day", async () => {
      const user = buildUser({
        discord: {
          id: DISCORD_ID,
          username: "ash",
          connectedAt: new Date("2026-01-01"),
          refreshedAt: new Date(Date.now() - 60 * 60_000),
        },
      });

      const result = await service.reconcile(ACCOUNT, user);

      expect(result).toBe(user);
      expect(discordService.fetchUser).not.toHaveBeenCalled();
    });

    it("ignores a bot that cannot find the user", async () => {
      const user = buildUser({
        discord: {
          id: DISCORD_ID,
          username: "ash",
          connectedAt: new Date("2026-01-01"),
          refreshedAt: new Date(0),
        },
      });

      const result = await service.reconcile(ACCOUNT, user);

      expect(result).toBe(user);
      expect(repo.applyChanges).not.toHaveBeenCalled();
    });

    it("never fails the request when the refresh throws", async () => {
      discordService.fetchUser.mockRejectedValue(new Error("gateway down"));
      const user = buildUser({
        discord: {
          id: DISCORD_ID,
          username: "ash",
          connectedAt: new Date("2026-01-01"),
          refreshedAt: new Date(0),
        },
      });

      await expect(service.reconcile(ACCOUNT, user)).resolves.toBe(user);
    });
  });

  describe("users/me payload", () => {
    it("has no typed Discord name in the profile", () => {
      const payload = UserMapper.toClientPayload(
        buildUser({ profile: new UserProfile({ discordName: "old#1" }) }),
      );

      expect(payload.profile).not.toHaveProperty("discordName");
    });

    it("marks a Discord sign-in as viaSignIn and others as not", () => {
      const discord = {
        id: DISCORD_ID,
        username: "ash",
        connectedAt: new Date("2026-11-01"),
        refreshedAt: new Date("2026-11-01"),
      };

      expect(
        UserMapper.toClientPayload(
          buildUser({ sub: `oauth2|discord|${DISCORD_ID}`, signIn: `oauth2|discord|${DISCORD_ID}`, discord }),
        ).discord,
      ).toEqual({
        id: DISCORD_ID,
        username: "ash",
        connectedAt: "2026-11-01T00:00:00.000Z",
        viaSignIn: true,
      });
      expect(
        UserMapper.toClientPayload(buildUser({ discord })).discord?.viaSignIn,
      ).toBe(false);
      expect(UserMapper.toClientPayload(buildUser()).discord).toBeNull();
    });

    it("reads viaSignIn from the sign-in on the row when account ids are internal", () => {
      const discord = {
        id: DISCORD_ID,
        username: "ash",
        connectedAt: new Date("2026-11-01"),
        refreshedAt: new Date("2026-11-01"),
      };

      const payload = UserMapper.toClientPayload(
        buildUser({
          sub: "64b000000000000000000001",
          signIn: `oauth2|discord|${DISCORD_ID}`,
          discord,
        }),
      );

      expect(payload.discord?.viaSignIn).toBe(true);
    });
  });
});
