import { ErrorCodes } from "@core/pdz-error-codes";
import { Types } from "mongoose";
import { AccountIdentityService } from "./account-identity.service";
import { User } from "./user.domain";
import { UserMapper } from "./user.mapper";
import { UserRepository } from "./user.repository";

const ACCOUNT = "65f0c0ffee0000000000abcd";

function execResult<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function execFailure(error: unknown) {
  return { exec: jest.fn().mockRejectedValue(error) };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(ACCOUNT),
    auth0Sub: "oauth2|discord|42",
    username: "Ash",
    displayName: "Ash",
    joined: new Date("2026-01-01"),
    lastLogin: new Date("2026-02-01"),
    lastCheckedAdsAt: new Date(0),
    roles: [],
    settings: {},
    ...overrides,
  };
}

describe.each([["auth0"], ["internal"]])("UserRepository in %s mode", (mode) => {
  const internal = mode === "internal";
  let userModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; find: jest.Mock };
  let repo: UserRepository;

  const expectedFilter = internal
    ? { _id: new Types.ObjectId(ACCOUNT) }
    : { auth0Sub: { $eq: ACCOUNT } };
  const callerId = ACCOUNT;

  beforeEach(() => {
    userModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn() };
    repo = new UserRepository(
      userModel as any,
      new AccountIdentityService({ get: () => (internal ? "internal" : undefined) } as any),
    );
  });

  it("looks the caller up by the mode's key", async () => {
    userModel.findOne.mockReturnValue(execResult(row()));

    const user = await repo.getUserBySub(callerId);

    expect(userModel.findOne).toHaveBeenCalledWith(expectedFilter);
    expect(user.sub).toBe(internal ? ACCOUNT : "oauth2|discord|42");
    expect(user.signIn).toBe("oauth2|discord|42");
  });

  it("filters settings and profile writes by the mode's key", async () => {
    userModel.findOneAndUpdate.mockReturnValue(execResult(row()));

    await repo.updateSettings(callerId, { theme: "dark" });
    await repo.applyChanges(callerId, { set: { privateProfile: true } });

    expect(userModel.findOneAndUpdate.mock.calls[0][0]).toEqual(expectedFilter);
    expect(userModel.findOneAndUpdate.mock.calls[1][0]).toEqual(expectedFilter);
  });

  it("returns the owner's account id for a profile id", async () => {
    userModel.findOne.mockReturnValue(execResult(row()));

    expect(await repo.profileOwnerSub(ACCOUNT)).toBe(
      internal ? ACCOUNT : "oauth2|discord|42",
    );
    expect(userModel.findOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(ACCOUNT) },
      { auth0Sub: 1 },
    );
  });

  it("returns null when no row has the profile id or it is not an ObjectId", async () => {
    userModel.findOne.mockReturnValue(execResult(null));

    expect(await repo.profileOwnerSub(ACCOUNT)).toBeNull();
    expect(await repo.profileOwnerSub("ash")).toBeNull();
    expect(userModel.findOne).toHaveBeenCalledTimes(1);
  });

  it("builds a public card by profile id with the mode's account id", async () => {
    userModel.findOne.mockReturnValue(execResult(row({ privateProfile: true })));

    expect(await repo.findPublicCardById(ACCOUNT)).toEqual({
      accountId: internal ? ACCOUNT : "oauth2|discord|42",
      profileId: ACCOUNT,
      displayName: "Ash",
      username: "Ash",
      joined: new Date("2026-01-01"),
      privateProfile: true,
    });
  });

  it("answers null for a public card with a malformed or unknown profile id", async () => {
    userModel.findOne.mockReturnValue(execResult(null));

    expect(await repo.findPublicCardById("ash")).toBeNull();
    expect(await repo.findPublicCardById(ACCOUNT.slice(1))).toBeNull();
    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(await repo.findPublicCardById(ACCOUNT)).toBeNull();
  });

  it("finds an account record by profile id", async () => {
    userModel.findOne.mockReturnValue(execResult(row()));

    const record = await repo.findAccountByProfileId(ACCOUNT);

    expect(record).toMatchObject({
      accountId: ACCOUNT,
      profileId: ACCOUNT,
      signIn: "oauth2|discord|42",
      displayName: "Ash",
    });
    expect(record).not.toHaveProperty("handle");
    expect(await repo.findAccountByProfileId("nope")).toBeNull();
  });

  it("looks several accounts up by the mode's key", async () => {
    userModel.find.mockReturnValue(execResult([]));

    await repo.findManyBySubs([ACCOUNT]);

    expect(userModel.find).toHaveBeenCalledWith(
      internal
        ? { _id: { $in: [new Types.ObjectId(ACCOUNT)] } }
        : { auth0Sub: { $in: [ACCOUNT] } },
      { auth0Sub: 1, username: 1, displayName: 1 },
    );
  });

  it("maps names by the mode's account id", async () => {
    userModel.find.mockReturnValue(
      execResult([
        row(),
        row({
          _id: new Types.ObjectId("65f0c0ffee0000000000abce"),
          auth0Sub: "google-oauth2|7",
          username: undefined,
          displayName: undefined,
        }),
      ]),
    );

    const names = await repo.findNamesByAccounts([ACCOUNT]);

    const first = internal ? ACCOUNT : "oauth2|discord|42";
    const second = internal ? "65f0c0ffee0000000000abce" : "google-oauth2|7";
    expect(names.get(first)).toEqual({
      profileId: ACCOUNT,
      displayName: "Ash",
      username: "Ash",
    });
    expect(names.get(second)).toEqual({
      profileId: "65f0c0ffee0000000000abce",
      displayName: null,
      username: null,
    });
  });

  it("always upserts the webhook row by auth0Sub", async () => {
    userModel.findOneAndUpdate.mockReturnValue(execResult(row()));

    await repo.updateUser(
      new User({
        sub: "oauth2|discord|42",
        signIn: "oauth2|discord|42",
        joined: new Date(),
        lastLogin: new Date(),
      }),
    );

    expect(userModel.findOneAndUpdate.mock.calls[0][0]).toEqual({
      auth0Sub: { $eq: "oauth2|discord|42" },
    });
  });
});

describe("UserRepository in internal mode", () => {
  let userModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; find: jest.Mock };
  let repo: UserRepository;

  beforeEach(() => {
    userModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn() };
    repo = new UserRepository(
      userModel as any,
      new AccountIdentityService({ get: () => "internal" } as any),
    );
  });

  it.each(["google-oauth2|1", "not-an-id", "", "65f0c0ffee0000000000abc"])(
    "treats %p as not found without touching the database",
    async (bad) => {
      await expect(repo.getUserBySub(bad)).rejects.toMatchObject({
        code: ErrorCodes.USER.NOT_FOUND.code,
      });
      await expect(repo.getOrCreateUserBySub(bad, new Date())).rejects.toMatchObject({
        code: ErrorCodes.USER.NOT_FOUND.code,
      });
      await expect(repo.updateSettings(bad, {})).rejects.toMatchObject({
        code: ErrorCodes.USER.NOT_FOUND.code,
      });
      await expect(repo.applyChanges(bad, { set: { a: 1 } })).rejects.toMatchObject({
        code: ErrorCodes.USER.NOT_FOUND.code,
      });
      expect(await repo.findManyBySubs([bad])).toEqual([]);
      expect(userModel.findOne).not.toHaveBeenCalled();
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(userModel.find).not.toHaveBeenCalled();
    },
  );

  it("never creates a row from an account id", async () => {
    userModel.findOne.mockReturnValue(execResult(null));

    await expect(repo.getOrCreateUserBySub(ACCOUNT, new Date())).rejects.toMatchObject({
      code: ErrorCodes.USER.NOT_FOUND.code,
    });
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  describe("resolveAccountId", () => {
    it("returns the id of an existing row without writing", async () => {
      userModel.findOne.mockReturnValue(execResult({ _id: new Types.ObjectId(ACCOUNT) }));

      expect(await repo.resolveAccountId("google-oauth2|1", new Date())).toBe(ACCOUNT);
      expect(userModel.findOne).toHaveBeenCalledWith(
        { auth0Sub: { $eq: "google-oauth2|1" } },
        { _id: 1 },
      );
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("creates a missing row with the standard defaults", async () => {
      const now = new Date("2026-05-05");
      userModel.findOne.mockReturnValue(execResult(null));
      userModel.findOneAndUpdate.mockReturnValue(execResult(row()));

      expect(await repo.resolveAccountId("google-oauth2|1", now)).toBe(ACCOUNT);

      const [filter, update, options] = userModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ auth0Sub: { $eq: "google-oauth2|1" } });
      expect(update).toEqual({
        $setOnInsert: {
          joined: now,
          lastLogin: now,
          lastCheckedAdsAt: new Date(0),
          settings: {},
          roles: [],
        },
      });
      expect(options).toMatchObject({ upsert: true });
    });

    it("retries once when the webhook creates the row first", async () => {
      userModel.findOne.mockReturnValue(execResult(null));
      userModel.findOneAndUpdate
        .mockReturnValueOnce(execFailure({ code: 11000 }))
        .mockReturnValueOnce(execResult(row()));

      expect(await repo.resolveAccountId("google-oauth2|1", new Date())).toBe(ACCOUNT);
      expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });
  });
});

describe("client payload", () => {
  it("carries the account id as sub and the row id as profileId, never the sign-in", () => {
    const user = UserMapper.fromDatabase(row() as any, true);

    expect(user.sub).toBe(ACCOUNT);
    const payload = UserMapper.toClientPayload(user);

    expect(payload.sub).toBe(ACCOUNT);
    expect(payload.profileId).toBe(ACCOUNT);
    expect(payload).not.toHaveProperty("signIn");
  });

  it("has a profile id in auth0 mode too", () => {
    const payload = UserMapper.toClientPayload(
      UserMapper.fromDatabase(row() as any, false),
    );

    expect(payload.sub).toBe("oauth2|discord|42");
    expect(payload.profileId).toBe(ACCOUNT);
  });
});
