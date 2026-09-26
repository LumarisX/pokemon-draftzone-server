import { UserRole } from "@modules/user/user.schema";
import {
  DEFAULT_MAX_OWNED_LEAGUES,
  decideLeagueCreation,
  leagueCreationMode,
  maxOwnedLeagues,
} from "./league-creation";

describe("leagueCreationMode", () => {
  it("is beta unless explicitly opened", () => {
    expect(leagueCreationMode(undefined)).toBe("beta");
    expect(leagueCreationMode("")).toBe("beta");
    expect(leagueCreationMode("OPEN")).toBe("beta");
    expect(leagueCreationMode("open")).toBe("open");
  });
});

describe("maxOwnedLeagues", () => {
  it("falls back to the default for anything but a positive integer", () => {
    expect(maxOwnedLeagues(undefined)).toBe(DEFAULT_MAX_OWNED_LEAGUES);
    expect(maxOwnedLeagues("0")).toBe(DEFAULT_MAX_OWNED_LEAGUES);
    expect(maxOwnedLeagues("2.5")).toBe(DEFAULT_MAX_OWNED_LEAGUES);
    expect(maxOwnedLeagues("abc")).toBe(DEFAULT_MAX_OWNED_LEAGUES);
    expect(maxOwnedLeagues("7")).toBe(7);
  });
});

describe("decideLeagueCreation", () => {
  const base = { mode: "beta" as const, roles: [], ownedCount: 0, maxOwned: 3 };

  it("restricts users without the league-creator role during beta", () => {
    expect(decideLeagueCreation(base)).toEqual({
      allowed: false,
      reason: "restricted",
    });
  });

  it("allows league creators during beta", () => {
    expect(
      decideLeagueCreation({ ...base, roles: [UserRole.LEAGUE_CREATOR] }),
    ).toEqual({ allowed: true });
  });

  it("allows anyone once open", () => {
    expect(decideLeagueCreation({ ...base, mode: "open" })).toEqual({
      allowed: true,
    });
  });

  it("caps owned leagues in both modes", () => {
    for (const mode of ["beta", "open"] as const)
      expect(
        decideLeagueCreation({
          mode,
          roles: [UserRole.LEAGUE_CREATOR],
          ownedCount: 3,
          maxOwned: 3,
        }),
      ).toEqual({ allowed: false, reason: "limit" });
  });

  it("exempts site admins and owners from the gate and the cap", () => {
    for (const role of [UserRole.ADMIN, UserRole.OWNER])
      expect(
        decideLeagueCreation({ ...base, roles: [role], ownedCount: 50 }),
      ).toEqual({ allowed: true });
  });
});
