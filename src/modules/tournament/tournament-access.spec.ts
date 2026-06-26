import { isOrganizerOrOwner, TournamentAccess } from "./tournament-access";

function buildTournament(overrides: Partial<TournamentAccess> = {}): TournamentAccess {
  return {
    owner: "auth0|owner",
    organizers: ["auth0|organizer-1", "auth0|organizer-2"],
    ...overrides,
  };
}

describe("isOrganizerOrOwner", () => {
  it("returns false when sub is undefined", () => {
    expect(isOrganizerOrOwner(buildTournament(), undefined)).toBe(false);
  });

  it("returns true when sub matches the owner", () => {
    expect(isOrganizerOrOwner(buildTournament(), "auth0|owner")).toBe(true);
  });

  it("returns true when sub is one of the organizers", () => {
    expect(isOrganizerOrOwner(buildTournament(), "auth0|organizer-2")).toBe(true);
  });

  it("returns false for an unrelated sub", () => {
    expect(isOrganizerOrOwner(buildTournament(), "auth0|stranger")).toBe(false);
  });

  it("returns false when there are no organizers and sub isn't the owner", () => {
    const tournament = buildTournament({ organizers: [] });

    expect(isOrganizerOrOwner(tournament, "auth0|stranger")).toBe(false);
  });
});
