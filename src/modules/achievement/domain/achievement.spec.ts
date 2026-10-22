import {
  AchievementDefinition,
  TeamMatch,
  TeamSeason,
  achievementProgress,
  evaluateAchievement,
  evaluateAchievements,
} from "./achievement";
import { ACHIEVEMENTS } from "./catalog";
import { buildTeamSeasons } from "./team-season";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

function match(
  n: number,
  outcome: "w" | "l" | "d",
  games: TeamMatch["games"] = [],
  forfeit = false,
): TeamMatch {
  return { matchupId: `m${n}`, at: day(n), outcome, forfeit, games };
}

function season(matches: TeamMatch[], extra: Partial<TeamSeason> = {}): TeamSeason {
  return { teamId: "t", matches, trades: [], champion: null, ...extra };
}

function definition(id: string): AchievementDefinition {
  return ACHIEVEMENTS.find((entry) => entry.id === id)!;
}

const won = (pokemon: TeamMatch["games"][number]["pokemon"]) => ({
  won: true,
  lost: false,
  pokemon,
});

describe("evaluateAchievement", () => {
  it("reaches the highest tier the count clears and dates it by the event that cleared it", () => {
    const earned = evaluateAchievement(
      definition("victor"),
      season([match(1, "w"), match(2, "l"), match(3, "w"), match(4, "w"), match(5, "w")]),
    );

    expect(earned).toEqual({
      id: "victor",
      rarity: "silver",
      tier: 1,
      count: 4,
      next: 5,
      earnedAt: day(4),
    });
  });

  it("reports progress toward the first tier before it is earned", () => {
    expect(
      achievementProgress(definition("on-a-roll"), season([match(1, "w"), match(2, "l")])),
    ).toEqual({
      id: "on-a-roll",
      rarity: null,
      tier: -1,
      count: 1,
      next: 2,
      earnedAt: null,
    });
  });

  it("returns nothing until the first tier is reached", () => {
    expect(evaluateAchievement(definition("victor"), season([match(1, "l")]))).toBeNull();
  });

  it("does not count a forfeit as a win", () => {
    expect(
      evaluateAchievement(definition("victor"), season([match(1, "w", [], true)])),
    ).toBeNull();
  });
});

describe("the catalog", () => {
  it("counts the longest win streak, broken by a loss", () => {
    const earned = evaluateAchievement(
      definition("on-a-roll"),
      season([match(1, "w"), match(2, "w"), match(3, "l"), match(4, "w"), match(5, "w"), match(6, "w")]),
    );
    expect(earned).toMatchObject({ rarity: "silver", count: 3, earnedAt: day(6) });
  });

  it("awards Flawless only for a won game where nothing fainted", () => {
    const earned = evaluateAchievements(
      ACHIEVEMENTS,
      season([
        match(1, "w", [
          won([{ id: "garchomp", kills: 2, fainted: false }, { id: "pelipper", kills: 0, fainted: true }]),
          won([{ id: "garchomp", kills: 1, fainted: false }]),
        ]),
      ]),
    );
    expect(earned.find((entry) => entry.id === "flawless")).toMatchObject({ count: 1 });
    expect(earned.find((entry) => entry.id === "clean-sweep")).toMatchObject({ rarity: "silver" });
  });

  it("tracks one Pokémon's KOs across the season for Heavy Hitter", () => {
    const games = [1, 2, 3].map((n) =>
      match(n, "w", [won([{ id: "kingambit", kills: 2, fainted: false }, { id: "amoonguss", kills: 1, fainted: false }])]),
    );
    const earned = evaluateAchievement(definition("heavy-hitter"), season(games));
    expect(earned).toMatchObject({ rarity: "bronze", count: 6, earnedAt: day(3) });
  });

  it("resets Iron Wall when the Pokémon faints", () => {
    const game = (fainted: boolean) => won([{ id: "corviknight", kills: 0, fainted }]);
    const earned = evaluateAchievement(
      definition("iron-wall"),
      season([
        match(1, "w", [game(false), game(false)]),
        match(2, "w", [game(true)]),
        match(3, "w", [game(false), game(false), game(false)]),
      ]),
    );
    expect(earned).toMatchObject({ rarity: "silver", count: 3, earnedAt: day(3) });
  });

  it("gives the champion Champion and nobody else", () => {
    expect(
      evaluateAchievement(definition("champion"), season([], { champion: { at: day(9) } })),
    ).toMatchObject({ rarity: "platinum", earnedAt: day(9) });
    expect(evaluateAchievement(definition("champion"), season([]))).toBeNull();
  });
});

describe("buildTeamSeasons", () => {
  it("splits each matchup into both teams' view, in date order, with approved trades only", () => {
    const seasons = buildTeamSeasons({
      teamIds: ["a", "b"],
      championId: "a",
      matchups: [
        {
          _id: "m2",
          side1: { team: "a" },
          side2: { team: "b" },
          winner: "side2",
          scheduledDate: day(2),
          results: [
            {
              winner: "side2",
              side1: { pokemon: new Map([["garchomp", { status: "fainted", kills: { direct: 1 } }]]) },
              side2: { pokemon: { kingambit: { status: "survived", kills: { direct: 2, indirect: 1 } } } },
            },
          ],
        },
        { _id: "m1", side1: { team: "a" }, side2: { team: "b" }, winner: "side1", scheduledDate: day(1) },
        { _id: "m3", side1: { team: "a" }, side2: { team: "b" }, winner: null },
      ],
      trades: [
        { status: "APPROVED", timestamp: day(4), side1: { team: "a" }, side2: { team: "b" } },
        { status: "PENDING", timestamp: day(5), side1: { team: "a" }, side2: { team: "b" } },
      ],
    });

    const a = seasons.get("a")!;
    const b = seasons.get("b")!;
    expect(a.matches.map((entry) => entry.outcome)).toEqual(["w", "l"]);
    expect(b.matches[1].games[0]).toEqual({
      won: true,
      lost: false,
      pokemon: [{ id: "kingambit", kills: 3, fainted: false }],
    });
    expect(a.matches[1].games[0].pokemon[0]).toMatchObject({ fainted: true, kills: 1 });
    expect(a.trades).toHaveLength(1);
    expect(a.champion).toEqual({ at: day(2) });
    expect(b.champion).toBeNull();
  });
});
