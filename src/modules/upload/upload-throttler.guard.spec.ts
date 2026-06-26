import { UploadsThrottlerGuard } from "./upload-throttler.guard";

describe("UploadsThrottlerGuard.getTracker", () => {
  let guard: UploadsThrottlerGuard;

  beforeEach(() => {
    guard = new UploadsThrottlerGuard({} as any, {} as any, {} as any);
  });

  it("tracks by the authenticated user's sub when present", async () => {
    const req = { user: { sub: "auth0|user-1" }, ip: "1.2.3.4" };

    const result = await (guard as any).getTracker(req);

    expect(result).toBe("auth0|user-1");
  });

  it("falls back to the request IP when there's no authenticated user", async () => {
    const req = { user: undefined, ip: "1.2.3.4" };

    const result = await (guard as any).getTracker(req);

    expect(result).toBe("1.2.3.4");
  });

  it("falls back to the request IP when user.sub is missing", async () => {
    const req = { user: {}, ip: "1.2.3.4" };

    const result = await (guard as any).getTracker(req);

    expect(result).toBe("1.2.3.4");
  });
});
