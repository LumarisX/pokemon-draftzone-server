import { UserRole } from "@modules/user/user.schema";
import {
  DEFAULT_MAX_ACTIVE_TOURNAMENTS,
  decideTournamentCreation,
  maxActiveTournaments,
  mayHost,
  tournamentCreationMode,
} from "./tournament-creation.policy";

describe("tournamentCreationMode", () => {
  it("is beta unless explicitly opened", () => {
    expect(tournamentCreationMode(undefined)).toBe("beta");
    expect(tournamentCreationMode("")).toBe("beta");
    expect(tournamentCreationMode("OPEN")).toBe("beta");
    expect(tournamentCreationMode("open")).toBe("open");
  });
});

describe("maxActiveTournaments", () => {
  it("falls back to the default for anything but a positive integer", () => {
    expect(maxActiveTournaments(undefined)).toBe(DEFAULT_MAX_ACTIVE_TOURNAMENTS);
    expect(maxActiveTournaments("0")).toBe(DEFAULT_MAX_ACTIVE_TOURNAMENTS);
    expect(maxActiveTournaments("2.5")).toBe(DEFAULT_MAX_ACTIVE_TOURNAMENTS);
    expect(maxActiveTournaments("abc")).toBe(DEFAULT_MAX_ACTIVE_TOURNAMENTS);
    expect(maxActiveTournaments("7")).toBe(7);
  });
});

describe("mayHost", () => {
  it("needs the tournament-creator role during beta", () => {
    expect(mayHost("beta", [])).toBe(false);
    expect(mayHost("beta", [UserRole.TOURNAMENT_CREATOR])).toBe(true);
  });

  it("lets site staff host during beta", () => {
    expect(mayHost("beta", [UserRole.ADMIN])).toBe(true);
    expect(mayHost("beta", [UserRole.OWNER])).toBe(true);
  });

  it("lets anyone host once open", () => {
    expect(mayHost("open", [])).toBe(true);
  });
});

describe("decideTournamentCreation", () => {
  const base = {
    mode: "beta" as const,
    roles: [],
    activeCount: 0,
    maxActive: 3,
  };

  it("restricts users without the tournament-creator role during beta", () => {
    expect(decideTournamentCreation(base)).toEqual({
      allowed: false,
      reason: "restricted",
    });
  });

  it("allows tournament creators during beta", () => {
    expect(
      decideTournamentCreation({
        ...base,
        roles: [UserRole.TOURNAMENT_CREATOR],
      }),
    ).toEqual({ allowed: true });
  });

  it("allows anyone once open", () => {
    expect(decideTournamentCreation({ ...base, mode: "open" })).toEqual({
      allowed: true,
    });
  });

  it("caps active tournaments in both modes", () => {
    for (const mode of ["beta", "open"] as const)
      expect(
        decideTournamentCreation({
          mode,
          roles: [UserRole.TOURNAMENT_CREATOR],
          activeCount: 3,
          maxActive: 3,
        }),
      ).toEqual({ allowed: false, reason: "limit" });
  });

  it("exempts site admins and owners from the gate and the cap", () => {
    for (const role of [UserRole.ADMIN, UserRole.OWNER])
      expect(
        decideTournamentCreation({ ...base, roles: [role], activeCount: 50 }),
      ).toEqual({ allowed: true });
  });
});
