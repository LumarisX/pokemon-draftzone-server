import { UserThrottlerGuard } from "./user-throttler.guard";

describe("UserThrottlerGuard", () => {
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    guard = new UserThrottlerGuard({} as any, {} as any, {} as any);
  });

  it("tracks by the authenticated user's sub when present", async () => {
    const req = { user: { sub: "auth0|user-1" }, ip: "1.2.3.4" };

    await expect((guard as any).getTracker(req)).resolves.toBe("auth0|user-1");
  });

  it("falls back to the request IP when there's no authenticated user", async () => {
    const req = { user: undefined, ip: "1.2.3.4" };

    await expect((guard as any).getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("falls back to the request IP when user.sub is missing", async () => {
    const req = { user: {}, ip: "1.2.3.4" };

    await expect((guard as any).getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("refuses with a readable 429", async () => {
    const error = await (guard as any)
      .throwThrottlingException()
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "SYS-006" });
    expect(error.getStatus()).toBe(429);
  });
});
