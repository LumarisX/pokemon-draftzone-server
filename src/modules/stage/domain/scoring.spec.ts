import {
  defaultTiebreakers,
  PlayedGame,
  rankStandings,
  resolveStandingsRules,
  sideResult,
} from "./scoring";

function game(winner: "side1" | "side2" | "draw", side1: number, side2: number) {
  return { winner, side1: { score: side1 }, side2: { score: side2 } };
}

function matchup(overrides: Record<string, unknown>) {
  return {
    side1: { score: 0 },
    side2: { score: 0 },
    results: [],
    ...overrides,
  } as any;
}

const FORFEIT = { gameDiff: 2, pokemonDiff: 6 };

describe("sideResult", () => {
  it("is null for a match with no result", () => {
    expect(sideResult(matchup({}), "side1")).toBeNull();
  });

  it("scores a played win and loss from each game's remaining Pokémon", () => {
    const played = matchup({
      winner: "side1",
      side1: { score: 2 },
      side2: { score: 1 },
      results: [game("side1", 3, 0), game("side2", 0, 2), game("side1", 1, 0)],
    });

    expect(sideResult(played, "side1")).toEqual({
      outcome: "w",
      gameDiff: 1,
      pokemonDiff: 3 - 2 + 1,
    });
    expect(sideResult(played, "side2")).toEqual({
      outcome: "l",
      gameDiff: -1,
      pokemonDiff: -3 + 2 - 1,
    });
  });

  it("works when only scores were entered, with no per-Pokémon statuses", () => {
    const played = matchup({
      winner: "side2",
      side1: { score: 0 },
      side2: { score: 1 },
      results: [game("side2", 0, 4)],
    });

    expect(sideResult(played, "side2")?.pokemonDiff).toBe(4);
  });

  it("records a drawn series as a draw for both sides", () => {
    const drawn = matchup({
      winner: "draw",
      side1: { score: 1 },
      side2: { score: 1 },
      results: [game("side1", 2, 0), game("side2", 0, 2)],
    });

    expect(sideResult(drawn, "side1")).toEqual({
      outcome: "d",
      gameDiff: 0,
      pokemonDiff: 0,
    });
    expect(sideResult(drawn, "side2")?.outcome).toBe("d");
  });

  it("applies the forfeit differential to both sides", () => {
    const forfeited = matchup({ winner: "side1", forfeit: true });

    expect(sideResult(forfeited, "side1", FORFEIT)).toEqual({
      outcome: "w",
      gameDiff: 2,
      pokemonDiff: 6,
    });
    expect(sideResult(forfeited, "side2", FORFEIT)).toEqual({
      outcome: "ff",
      gameDiff: -2,
      pokemonDiff: -6,
    });
  });

  it("treats a double forfeit as a forfeit loss for both", () => {
    const double = matchup({ winner: "draw", forfeit: true });

    expect(sideResult(double, "side1", FORFEIT)?.outcome).toBe("ff");
    expect(sideResult(double, "side2", FORFEIT)?.outcome).toBe("ff");
  });
});

describe("resolveStandingsRules", () => {
  it("defaults to 3/1/0 and a tiebreaker order led by the diff mode", () => {
    expect(resolveStandingsRules({ diffMode: "pokemon" })).toEqual({
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: ["pokemonDiff", "gameDiff", "headToHead"],
    });
    expect(defaultTiebreakers("game")).toEqual([
      "gameDiff",
      "pokemonDiff",
      "headToHead",
    ]);
  });

  it("uses stored points and tiebreakers over the defaults", () => {
    expect(
      resolveStandingsRules({
        diffMode: "pokemon",
        standingsRules: {
          points: { win: 2, draw: 1, loss: 0 },
          tiebreakers: ["headToHead", "strengthOfSchedule"],
        },
      }),
    ).toEqual({
      points: { win: 2, draw: 1, loss: 0 },
      tiebreakers: ["headToHead", "strengthOfSchedule"],
    });
  });

  it("falls back to the diff mode's order when the stored list is empty", () => {
    expect(
      resolveStandingsRules({
        diffMode: "game",
        standingsRules: { tiebreakers: [] },
      }).tiebreakers,
    ).toEqual(["gameDiff", "pokemonDiff", "headToHead"]);
  });
});

describe("rankStandings", () => {
  function row(
    teamId: string,
    points: number,
    gameDiff = 0,
    pokemonDiff = 0,
  ) {
    return { teamId, points, gameDiff, pokemonDiff };
  }

  const ids = (rows: { teamId: string }[]) => rows.map((r) => r.teamId);

  it("ranks by points first", () => {
    expect(
      ids(rankStandings([row("a", 3), row("b", 7), row("c", 4)], [], [])),
    ).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie with the tiebreakers in the order given", () => {
    const rows = [row("a", 6, 4, 1), row("b", 6, 1, 9)];

    expect(ids(rankStandings(rows, [], ["gameDiff", "pokemonDiff"]))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(rankStandings(rows, [], ["pokemonDiff", "gameDiff"]))).toEqual([
      "b",
      "a",
    ]);
  });

  it("falls through to the next tiebreaker only when the earlier ones tie", () => {
    const rows = [row("a", 6, 2, 1), row("b", 6, 2, 5), row("c", 6, 3, 0)];

    expect(ids(rankStandings(rows, [], ["gameDiff", "pokemonDiff"]))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("uses only the games between the tied teams for head-to-head", () => {
    const rows = [row("a", 6), row("b", 6), row("c", 6), row("d", 0)];
    const games: PlayedGame[] = [
      { teamId: "b", opponentId: "a", points: 3 },
      { teamId: "a", opponentId: "b", points: 0 },
      { teamId: "b", opponentId: "c", points: 3 },
      { teamId: "c", opponentId: "b", points: 0 },
      { teamId: "a", opponentId: "c", points: 3 },
      { teamId: "c", opponentId: "a", points: 0 },
      { teamId: "c", opponentId: "d", points: 3 },
      { teamId: "c", opponentId: "d", points: 3 },
      { teamId: "c", opponentId: "d", points: 3 },
    ];

    expect(ids(rankStandings(rows, games, ["headToHead"]))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("re-applies head-to-head to the smaller group left tied", () => {
    const rows = [row("a", 6, 1), row("b", 6, 1), row("c", 6, 0)];
    const games: PlayedGame[] = [
      { teamId: "b", opponentId: "a", points: 3 },
      { teamId: "a", opponentId: "b", points: 0 },
    ];

    expect(ids(rankStandings(rows, games, ["gameDiff", "headToHead"]))).toEqual(
      ["b", "a", "c"],
    );
  });

  it("scores strength of schedule as the total points of every opponent faced", () => {
    const rows = [row("a", 3), row("b", 3), row("strong", 9), row("weak", 0)];
    const games: PlayedGame[] = [
      { teamId: "a", opponentId: "weak", points: 3 },
      { teamId: "b", opponentId: "strong", points: 3 },
    ];

    expect(
      ids(rankStandings(rows, games, ["strengthOfSchedule"])).slice(1, 3),
    ).toEqual(["b", "a"]);
  });

  it("keeps the incoming order for teams still tied after every tiebreaker", () => {
    const rows = [row("first", 3), row("second", 3), row("third", 3)];

    expect(ids(rankStandings(rows, [], ["gameDiff"]))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
