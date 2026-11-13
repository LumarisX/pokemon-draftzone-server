import {
  achievementsFrom,
  careerFrom,
  orderSeasons,
  ProfileSeason,
} from "./profile.domain";

function season(id: string, completedAt: string | null): ProfileSeason {
  return {
    id,
    kind: "external",
    teamName: id,
    logo: null,
    leagueName: "League",
    tournamentName: null,
    pokemon: [],
    record: null,
    outcome: null,
    completedAt,
    hosted: null,
    external: { slug: id },
    archive: null,
  };
}

describe("careerFrom", () => {
  it("adds every season's record and works out the win rate", () => {
    const career = careerFrom(
      [
        { wins: 6, draws: 1, losses: 2 },
        { wins: 3, draws: 0, losses: 1 },
        null,
      ],
      [],
    );

    expect(career).toMatchObject({
      seasons: 3,
      wins: 9,
      draws: 1,
      losses: 3,
      winRate: 75,
    });
  });

  it("has no win rate before any match is decided", () => {
    expect(careerFrom([null], []).winRate).toBeNull();
  });

  it("counts titles and reports the best finish", () => {
    const career = careerFrom(
      [],
      [
        { placement: 4, of: 12, label: null, champion: false },
        { placement: 1, of: 8, label: "Champion", champion: true },
        null,
      ],
    );

    expect(career.titles).toBe(1);
    expect(career.best).toEqual({ placement: 1, of: 8 });
  });

  it("prefers the bigger league when two finishes tie", () => {
    const career = careerFrom(
      [],
      [
        { placement: 2, of: 6, label: null, champion: false },
        { placement: 2, of: 16, label: null, champion: false },
      ],
    );

    expect(career.best).toEqual({ placement: 2, of: 16 });
  });
});

describe("orderSeasons", () => {
  it("puts the most recently completed season first and undated ones last", () => {
    const ordered = orderSeasons([
      season("old", "2025-01-01T00:00:00Z"),
      season("undated", null),
      season("new", "2026-06-01T00:00:00Z"),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["new", "old", "undated"]);
  });
});

describe("achievementsFrom", () => {
  it("shows each achievement once at its best rarity with the seasons it was earned in", () => {
    const achievements = achievementsFrom([
      { id: "victor", rarity: "bronze" },
      { id: "victor", rarity: "gold" },
      { id: "victor", rarity: "silver" },
    ]);

    expect(achievements).toEqual([
      expect.objectContaining({ id: "victor", rarity: "gold", seasons: 3 }),
    ]);
  });

  it("leaves out achievements that were never earned and ids the catalog no longer has", () => {
    expect(achievementsFrom([{ id: "retired-achievement", rarity: "gold" }])).toEqual(
      [],
    );
  });
});
