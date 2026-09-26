import { Types } from "mongoose";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentDocument } from "./hosted-tournament.schema";

const league = { owner: "auth0|league-owner", slug: "league01", name: "League" };

function buildDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: "Season 1",
    slug: "season01",
    signUpDeadline: new Date("2026-10-01"),
    league: new Types.ObjectId(),
    staff: [],
    rules: [],
    stages: [],
    rounds: [],
    trades: [],
    forfeit: { gameDiff: 0, pokemonDiff: 0 },
    diffMode: "pokemon",
    draftCount: { min: 10, max: 12 },
    tierRequirements: [],
    ...overrides,
  } as unknown as HostedTournamentDocument;
}

describe("HostedTournamentMapper.fromDatabase", () => {
  it("uses the tournament's own owner when it has one", () => {
    const tournament = HostedTournamentMapper.fromDatabase(
      buildDoc({ owner: "auth0|season-owner" }),
      league,
      [],
    );

    expect(tournament.owner).toBe("auth0|season-owner");
    expect(tournament.getRoles("auth0|season-owner")).toContain("owner");
    expect(tournament.getRoles("auth0|league-owner")).toEqual([]);
  });

  it("falls back to the league owner until the backfill has run", () => {
    const tournament = HostedTournamentMapper.fromDatabase(buildDoc(), league, []);

    expect(tournament.owner).toBe("auth0|league-owner");
  });
});
