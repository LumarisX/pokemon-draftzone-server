import { PokemonStanding, StandingsRow } from "@modules/stage/domain/standings";
import { TeamOutcome } from "@modules/stage/domain/outcomes";
import { finalResults, seasonLeaders } from "./tournament-outcomes";

function mon(
  teamId: string,
  id: string,
  kills: number,
  deaths = 0,
  brought = 1,
): PokemonStanding {
  return {
    id,
    name: id,
    coach: "coach",
    teamName: teamId,
    teamId,
    record: { brought, kills, deaths, diff: kills - deaths },
  };
}

function row(id: string, wins: number, losses: number): StandingsRow {
  return {
    id,
    teamSlug: `${id}-slug`,
    name: id,
    coach: `${id} coach`,
    results: [],
    streak: 0,
    wins,
    draws: 0,
    losses,
    points: wins * 3,
    gameDiff: 0,
    pokemonDiff: 0,
    diffMode: "pokemon",
  };
}

describe("seasonLeaders", () => {
  it("ranks by most KOs, then fewer faints, then fewer games", () => {
    const leaders = seasonLeaders([
      mon("a", "pikachu", 5, 3),
      mon("a", "raichu", 5, 1),
      mon("b", "onix", 2, 1, 4),
      mon("b", "geodude", 2, 1, 2),
      mon("c", "magikarp", 0),
    ]);

    expect(leaders.get("a")).toEqual([
      { id: "raichu", name: "raichu", kills: 5 },
      { id: "pikachu", name: "pikachu", kills: 5 },
    ]);
    expect(leaders.get("b")?.map((entry) => entry.id)).toEqual([
      "geodude",
      "onix",
    ]);
    expect(leaders.has("c")).toBe(false);
  });

  it("keeps the top three of each team", () => {
    const leaders = seasonLeaders([
      mon("a", "pikachu", 1),
      mon("a", "raichu", 4),
      mon("a", "pichu", 2),
      mon("a", "onix", 3),
    ]);

    expect(leaders.get("a")?.map((entry) => entry.id)).toEqual([
      "raichu",
      "onix",
      "pichu",
    ]);
  });
});

describe("finalResults", () => {
  it("orders by placement and carries each team's record and MVP", () => {
    const outcomes = new Map<string, TeamOutcome>([
      ["b", { placement: 1, of: 2, label: "Champion", champion: true }],
      ["a", { placement: 2, of: 2, label: "Runner-Up", champion: false }],
    ]);

    const results = finalResults(
      outcomes,
      [row("a", 6, 1), row("b", 5, 2)],
      new Map([
        [
          "b",
          [
            { id: "onix", name: "Onix", kills: 9 },
            { id: "geodude", name: "Geodude", kills: 4 },
          ],
        ],
      ]),
    );

    expect(results.map((result) => result.teamId)).toEqual(["b", "a"]);
    expect(results[0]).toMatchObject({
      champion: true,
      teamSlug: "b-slug",
      coach: "b coach",
      wins: 5,
      losses: 2,
      mvp: { id: "onix", name: "Onix", kills: 9 },
    });
    expect(results[0].top.map((entry) => entry.id)).toEqual(["onix", "geodude"]);
    expect(results[1].mvp).toBeNull();
    expect(results[1].top).toEqual([]);
  });
});
