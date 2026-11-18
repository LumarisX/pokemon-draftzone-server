import { ErrorCodes } from "@core/pdz-error-codes";
import { AccountIdentityService } from "./account-identity.service";
import { User } from "./user.domain";
import { UserRepository } from "./user.repository";
import { UserRole } from "./user.schema";

function execResult<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function execFailure(error: unknown) {
  return { exec: jest.fn().mockRejectedValue(error) };
}

const entity = {
  auth0Sub: "auth0|user-1",
  joined: new Date("2026-01-01"),
  lastLogin: new Date("2026-02-01"),
  lastCheckedAdsAt: new Date(0),
  roles: [],
  settings: {},
  displayName: "Ash",
};

const COACH_NAME = /^Coach \d{4}$/;

describe("UserRepository", () => {
  let userModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
  };
  let repo: UserRepository;

  beforeEach(() => {
    userModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    repo = new UserRepository(
      userModel as any,
      new AccountIdentityService({ get: () => undefined } as any),
    );
  });

  describe("updateUser", () => {
    it("records lastLogin and roles but never touches identity fields or settings", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execResult(entity));
      const joined = new Date("2026-01-01");

      await repo.updateUser(
        new User({
          sub: "auth0|user-1",
          joined,
          lastLogin: new Date("2026-03-01"),
          roles: [UserRole.ADMIN],
        }),
      );

      const [filter, update, options] = userModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ auth0Sub: { $eq: "auth0|user-1" } });
      expect(update.$set).toEqual({
        lastLogin: new Date("2026-03-01"),
        roles: [UserRole.ADMIN],
      });
      expect(update.$setOnInsert).toEqual({
        displayName: expect.stringMatching(COACH_NAME),
        joined,
        lastCheckedAdsAt: new Date(0),
        settings: {},
      });
      expect(options).toMatchObject({ upsert: true });
      const touched = Object.keys(update.$set);
      for (const field of ["displayName", "profile", "settings"]) {
        expect(touched).not.toContain(field);
      }
    });

    it("defaults a new row's display name from the provider username", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execResult(entity));

      await repo.updateUser(
        new User({
          sub: "auth0|user-1",
          joined: new Date(),
          lastLogin: new Date(),
          username: "Ash Ketchum",
        }),
      );

      expect(
        userModel.findOneAndUpdate.mock.calls[0][1].$setOnInsert.displayName,
      ).toBe("Ash Ketchum");
    });

    it("fills a missing display name on an existing row, never overwriting one", async () => {
      const bare = { ...entity, _id: "row-1", username: "Misty", displayName: undefined };
      userModel.findOneAndUpdate
        .mockReturnValueOnce(execResult(bare))
        .mockReturnValueOnce(execResult({ ...bare, displayName: "Misty" }));

      await repo.updateUser(
        new User({
          sub: "auth0|user-1",
          joined: new Date(),
          lastLogin: new Date(),
          username: "Misty",
        }),
      );

      const [filter, update] = userModel.findOneAndUpdate.mock.calls[1];
      expect(filter).toEqual({ _id: "row-1", displayName: { $exists: false } });
      expect(update).toEqual({ $set: { displayName: "Misty" } });
    });

    it("writes username only when the payload carries one", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execResult(entity));

      await repo.updateUser(
        new User({
          sub: "auth0|user-1",
          joined: new Date(),
          lastLogin: new Date(),
          username: "Ash",
        }),
      );

      expect(userModel.findOneAndUpdate.mock.calls[0][1].$set.username).toBe("Ash");
    });

    it("retries once when a concurrent create wins the upsert", async () => {
      userModel.findOneAndUpdate
        .mockReturnValueOnce(execFailure({ code: 11000 }))
        .mockReturnValueOnce(execResult(entity));

      await repo.updateUser(
        new User({ sub: "auth0|user-1", joined: new Date(), lastLogin: new Date() }),
      );

      expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe("getOrCreateUserBySub", () => {
    it("returns an existing row without writing", async () => {
      userModel.findOne.mockReturnValue(execResult(entity));

      const user = await repo.getOrCreateUserBySub("auth0|user-1", new Date());

      expect(user.sub).toBe("auth0|user-1");
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("fills and saves a default display name when the row has none", async () => {
      const bare = { ...entity, _id: "row-1", username: "Gary Oak", displayName: undefined };
      userModel.findOne.mockReturnValue(execResult(bare));
      userModel.findOneAndUpdate.mockReturnValue(
        execResult({ ...bare, displayName: "Gary Oak" }),
      );

      const user = await repo.getOrCreateUserBySub("auth0|user-1", new Date());

      expect(user.displayName).toBe("Gary Oak");
      expect(userModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { displayName: "Gary Oak" },
      });
    });

    it("falls back to Coach and four digits when the username cleans to nothing", async () => {
      const bare = { ...entity, _id: "row-1", username: "😀😀", displayName: undefined };
      userModel.findOne.mockReturnValue(execResult(bare));
      userModel.findOneAndUpdate.mockImplementation((_filter, update) =>
        execResult({ ...bare, displayName: update.$set.displayName }),
      );

      const user = await repo.getOrCreateUserBySub("auth0|user-1", new Date());

      expect(user.displayName).toMatch(COACH_NAME);
    });

    it("creates the row with joined, lastLogin, empty settings, no roles", async () => {
      const now = new Date("2026-05-05");
      userModel.findOne.mockReturnValue(execResult(null));
      userModel.findOneAndUpdate.mockReturnValue(execResult(entity));

      await repo.getOrCreateUserBySub("auth0|user-1", now);

      const [, update, options] = userModel.findOneAndUpdate.mock.calls[0];
      expect(update).toEqual({
        $setOnInsert: {
          displayName: expect.stringMatching(COACH_NAME),
          joined: now,
          lastLogin: now,
          lastCheckedAdsAt: new Date(0),
          settings: {},
          roles: [],
        },
      });
      expect(options).toMatchObject({ upsert: true });
    });
  });

  describe("applyChanges", () => {
    it("sends $set and $unset", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execResult(entity));

      await repo.applyChanges("auth0|user-1", {
        set: { privateProfile: true },
        unset: ["profile.gameName"],
      });

      expect(userModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { privateProfile: true },
        $unset: { "profile.gameName": "" },
      });
    });

    it("rethrows failures", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execFailure(new Error("boom")));

      await expect(
        repo.applyChanges("auth0|user-1", { set: { privateProfile: true } }),
      ).rejects.toThrow("boom");
    });

    it("throws USER.NOT_FOUND when no row matches", async () => {
      userModel.findOneAndUpdate.mockReturnValue(execResult(null));

      await expect(
        repo.applyChanges("auth0|user-1", { set: { privateProfile: true } }),
      ).rejects.toMatchObject({ code: ErrorCodes.USER.NOT_FOUND.code });
    });
  });
});
