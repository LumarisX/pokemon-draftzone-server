import { UserSignInRepository } from "./user-sign-in.repository";

function exec<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe("UserSignInRepository", () => {
  let model: Record<string, jest.Mock>;
  let repo: UserSignInRepository;

  beforeEach(() => {
    model = {
      findOne: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    };
    repo = new UserSignInRepository(model as any);
  });

  it("finds a row by sign-in with an equality match", async () => {
    model.findOne.mockReturnValue(
      exec({ signIn: "s", accountId: "a", blocked: true, extra: 1 }),
    );

    expect(await repo.find("s")).toEqual({ signIn: "s", accountId: "a", blocked: true });
    expect(model.findOne).toHaveBeenCalledWith({ signIn: { $eq: "s" } });
  });

  it("returns null when there is no row", async () => {
    model.findOne.mockReturnValue(exec(null));

    expect(await repo.find("s")).toBeNull();
  });

  it("reads a missing blocked flag as false", async () => {
    model.findOne.mockReturnValue(exec({ signIn: "s", accountId: "a" }));

    expect((await repo.find("s"))?.blocked).toBe(false);
  });

  it("lists the rows pointing at an account", async () => {
    model.find.mockReturnValue(exec([{ signIn: "s", accountId: "a", blocked: false }]));

    expect(await repo.listByAccount("a")).toEqual([
      { signIn: "s", accountId: "a", blocked: false },
    ]);
    expect(model.find).toHaveBeenCalledWith({ accountId: { $eq: "a" } });
  });

  it("blocks with an upsert keyed on both the sign-in and the account", async () => {
    model.updateOne.mockReturnValue(exec({}));
    const now = new Date();

    await repo.block("s", "a", now);

    expect(model.updateOne).toHaveBeenCalledWith(
      { signIn: { $eq: "s" }, accountId: { $eq: "a" } },
      { $set: { blocked: true, blockedAt: now } },
      { upsert: true },
    );
  });

  it("unblocks without creating a row", async () => {
    model.updateOne.mockReturnValue(exec({}));

    await repo.unblock("s", "a");

    expect(model.updateOne).toHaveBeenCalledWith(
      { signIn: { $eq: "s" }, accountId: { $eq: "a" } },
      { $set: { blocked: false }, $unset: { blockedAt: "" } },
    );
  });

  it("points a sign-in only when no row exists", async () => {
    model.updateOne.mockReturnValueOnce(exec({ upsertedCount: 1 }));
    expect(await repo.point("s", "a")).toBe(true);
    expect(model.updateOne).toHaveBeenCalledWith(
      { signIn: { $eq: "s" } },
      { $setOnInsert: { accountId: "a", blocked: false } },
      { upsert: true },
    );

    model.updateOne.mockReturnValueOnce(exec({ upsertedCount: 0 }));
    expect(await repo.point("s", "a")).toBe(false);
  });

  it("removes only the row that points at the named account", async () => {
    model.deleteOne.mockReturnValue(exec({ deletedCount: 1 }));

    expect(await repo.remove("s", "a")).toBe(true);
    expect(model.deleteOne).toHaveBeenCalledWith({
      signIn: { $eq: "s" },
      accountId: { $eq: "a" },
    });
  });
});
