import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { createCache } from "cache-manager";
import { AccountIdentityService } from "./account-identity.service";
import { DiscordConnectService } from "./discord-connect.service";
import { UserSignInRepository } from "./user-sign-in.repository";
import { User } from "./user.domain";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

const ACCOUNT = "65f0c0ffee0000000000abcd";
const TARGET = "65f0c0ffee0000000000ffff";

function identity(value: string | undefined) {
  return new AccountIdentityService({ get: () => value } as any);
}

describe("AccountIdentityService", () => {
  it.each([
    [undefined, "auth0"],
    ["", "auth0"],
    ["auth0", "auth0"],
    ["nonsense", "auth0"],
    ["internal", "internal"],
  ])("reads %p as %s", (value, mode) => {
    expect(identity(value).mode).toBe(mode);
  });
});

describe("UserService.resolveAccount", () => {
  let repo: { resolveAccountId: jest.Mock; accountExists: jest.Mock };
  let signIns: { find: jest.Mock };
  let cache: AppCacheService;

  function build(mode: string | undefined) {
    return new UserService(
      repo as unknown as UserRepository,
      cache,
      identity(mode),
      signIns as unknown as UserSignInRepository,
      {} as DiscordConnectService,
    );
  }

  beforeEach(() => {
    repo = {
      resolveAccountId: jest.fn().mockResolvedValue(ACCOUNT),
      accountExists: jest.fn().mockResolvedValue(true),
    };
    signIns = { find: jest.fn().mockResolvedValue(null) };
    cache = new AppCacheService(createCache());
  });

  it("returns the sign-in id untouched and never reads the database in auth0 mode", async () => {
    const service = build(undefined);

    expect(await service.resolveAccount("google-oauth2|1")).toBe("google-oauth2|1");
    expect(repo.resolveAccountId).not.toHaveBeenCalled();
    expect(repo.accountExists).not.toHaveBeenCalled();
    expect(signIns.find).not.toHaveBeenCalled();
  });

  it("resolves the sign-in to the row id in internal mode when it has no sign-ins row", async () => {
    const service = build("internal");

    expect(await service.resolveAccount("google-oauth2|1")).toBe(ACCOUNT);
    expect(signIns.find).toHaveBeenCalledWith("google-oauth2|1");
    expect(repo.resolveAccountId).toHaveBeenCalledWith(
      "google-oauth2|1",
      expect.any(Date),
    );
  });

  it("caches the mapping so a second call skips the repository", async () => {
    const service = build("internal");

    await service.resolveAccount("google-oauth2|1");
    await service.resolveAccount("google-oauth2|1");

    expect(repo.resolveAccountId).toHaveBeenCalledTimes(1);
    expect(signIns.find).toHaveBeenCalledTimes(1);
  });

  it("keeps separate sign-ins apart", async () => {
    repo.resolveAccountId
      .mockResolvedValueOnce("a".repeat(24))
      .mockResolvedValueOnce("b".repeat(24));
    const service = build("internal");

    expect(await service.resolveAccount("one")).toBe("a".repeat(24));
    expect(await service.resolveAccount("two")).toBe("b".repeat(24));
  });

  it("refuses a blocked sign-in with the blocked code and caches nothing", async () => {
    signIns.find.mockResolvedValue({
      signIn: "google-oauth2|1",
      accountId: ACCOUNT,
      blocked: true,
    });
    const service = build("internal");

    await expect(service.resolveAccount("google-oauth2|1")).rejects.toMatchObject({
      code: "USR-011",
    });
    await expect(service.resolveAccount("google-oauth2|1")).rejects.toMatchObject({
      status: 403,
    });
    expect(signIns.find).toHaveBeenCalledTimes(2);
    expect(repo.resolveAccountId).not.toHaveBeenCalled();
    expect(repo.accountExists).not.toHaveBeenCalled();
  });

  it("follows a re-pointed sign-in to the account it names", async () => {
    signIns.find.mockResolvedValue({
      signIn: "google-oauth2|1",
      accountId: TARGET,
      blocked: false,
    });
    const service = build("internal");

    expect(await service.resolveAccount("google-oauth2|1")).toBe(TARGET);
    expect(repo.accountExists).toHaveBeenCalledWith(TARGET);
    expect(repo.resolveAccountId).not.toHaveBeenCalled();
  });

  it("falls back to the sign-in's own account when the target no longer exists", async () => {
    signIns.find.mockResolvedValue({
      signIn: "google-oauth2|1",
      accountId: TARGET,
      blocked: false,
    });
    repo.accountExists.mockResolvedValue(false);
    const service = build("internal");

    expect(await service.resolveAccount("google-oauth2|1")).toBe(ACCOUNT);
    expect(repo.resolveAccountId).toHaveBeenCalled();
  });

  it("stops serving a cached account the moment the sign-in is invalidated", async () => {
    const service = build("internal");
    expect(await service.resolveAccount("google-oauth2|1")).toBe(ACCOUNT);

    signIns.find.mockResolvedValue({
      signIn: "google-oauth2|1",
      accountId: ACCOUNT,
      blocked: true,
    });
    await service.invalidateSignIn("google-oauth2|1", ACCOUNT);

    await expect(service.resolveAccount("google-oauth2|1")).rejects.toMatchObject({
      code: "USR-011",
    });
  });

  it("does not cache a resolution that was read before an invalidation landed", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    signIns.find.mockImplementationOnce(async () => {
      await gate;
      return null;
    });
    const service = build("internal");

    const pending = service.resolveAccount("google-oauth2|1");
    await new Promise((resolve) => setImmediate(resolve));
    expect(signIns.find).toHaveBeenCalledTimes(1);
    await service.invalidateSignIn("google-oauth2|1", ACCOUNT);
    signIns.find.mockResolvedValue({
      signIn: "google-oauth2|1",
      accountId: ACCOUNT,
      blocked: true,
    });
    release(undefined);

    await expect(pending).rejects.toMatchObject({ code: "USR-011" });
  });

  it("invalidates the sign-in and account cache entries", async () => {
    const invalidate = jest.fn().mockResolvedValue(undefined);
    const service = new UserService(
      repo as unknown as UserRepository,
      { invalidate } as unknown as AppCacheService,
      identity("internal"),
      signIns as unknown as UserSignInRepository,
      {} as DiscordConnectService,
    );

    await service.invalidateSignIn("google-oauth2|1", ACCOUNT, TARGET);

    expect(invalidate).toHaveBeenCalledWith(
      CacheKeys.signIn("google-oauth2|1"),
      CacheKeys.user(ACCOUNT),
      CacheKeys.user(TARGET),
    );
  });
});

describe("UserService.syncUser invalidation", () => {
  const user = new User({
    sub: "google-oauth2|1",
    signIn: "google-oauth2|1",
    roles: [],
    joined: new Date(),
    lastLogin: new Date(),
  });

  function setup(mode: string | undefined, row: unknown = null) {
    const repo = {
      updateUser: jest.fn().mockResolvedValue({ _id: ACCOUNT, auth0Sub: user.sub }),
      touchAccount: jest.fn().mockResolvedValue({ _id: TARGET }),
    };
    const signIns = { find: jest.fn().mockResolvedValue(row) };
    const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const service = new UserService(
      repo as unknown as UserRepository,
      cache as unknown as AppCacheService,
      identity(mode),
      signIns as unknown as UserSignInRepository,
      {} as DiscordConnectService,
    );
    return { repo, cache, signIns, service };
  }

  it("upserts by the Auth0 id and clears the Auth0-keyed user cache in auth0 mode", async () => {
    const { repo, cache, signIns, service } = setup(undefined);

    await service.syncUser(user);

    expect(repo.updateUser).toHaveBeenCalledWith(user);
    expect(signIns.find).not.toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(
      CacheKeys.user("google-oauth2|1"),
      CacheKeys.signIn("google-oauth2|1"),
    );
  });

  it("ignores a sign-in row in auth0 mode", async () => {
    const { repo, signIns, service } = setup(undefined, {
      signIn: user.sub,
      accountId: TARGET,
      blocked: true,
    });

    await service.syncUser(user);

    expect(signIns.find).not.toHaveBeenCalled();
    expect(repo.touchAccount).not.toHaveBeenCalled();
    expect(repo.updateUser).toHaveBeenCalled();
  });

  it("clears the account-keyed user cache and the sign-in mapping in internal mode", async () => {
    const { repo, cache, service } = setup("internal");

    await service.syncUser(user);

    expect(repo.updateUser).toHaveBeenCalledWith(user);
    expect(cache.invalidate).toHaveBeenCalledWith(
      CacheKeys.user(ACCOUNT),
      CacheKeys.signIn("google-oauth2|1"),
    );
  });

  it("updates the target account and creates nothing for a re-pointed sign-in", async () => {
    const { repo, cache, service } = setup("internal", {
      signIn: user.sub,
      accountId: TARGET,
      blocked: false,
    });

    const result = await service.syncUser(user);

    expect(repo.touchAccount).toHaveBeenCalledWith(TARGET, user.lastLogin);
    expect(repo.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ _id: TARGET });
    expect(cache.invalidate).toHaveBeenCalledWith(
      CacheKeys.user(TARGET),
      CacheKeys.signIn("google-oauth2|1"),
    );
  });

  it("does nothing for a blocked sign-in", async () => {
    const { repo, cache, service } = setup("internal", {
      signIn: user.sub,
      accountId: TARGET,
      blocked: true,
    });

    expect(await service.syncUser(user)).toBeNull();
    expect(repo.touchAccount).not.toHaveBeenCalled();
    expect(repo.updateUser).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it("falls back to the ordinary upsert when the re-pointed target is gone", async () => {
    const { repo, service } = setup("internal", {
      signIn: user.sub,
      accountId: TARGET,
      blocked: false,
    });
    repo.touchAccount.mockResolvedValue(null);

    await service.syncUser(user);

    expect(repo.updateUser).toHaveBeenCalledWith(user);
  });
});
