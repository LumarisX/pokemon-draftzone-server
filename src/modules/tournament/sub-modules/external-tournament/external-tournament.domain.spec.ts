import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { ExternalTournament } from "./external-tournament.domain";

function buildTournament(matchups: Partial<ExternalMatchup>[]) {
  return new ExternalTournament(
    {
      ruleset: { name: "Gen9 NatDex" } as any,
      format: { name: "Singles" } as any,
      leagueName: "Spring League",
      teamName: "Team Rocket",
      key: "springleague",
      owner: "auth0|owner",
      team: [],
    },
    matchups as ExternalMatchup[],
  );
}

function game(aScore: number, bScore: number, winner?: "a" | "b") {
  return {
    winner,
    aTeam: { stats: [], score: aScore },
    bTeam: { stats: [], score: bScore },
  };
}

describe("ExternalTournament.getScore", () => {
  it("returns a 0-0 record with a +0 diff when there are no matchups", () => {
    expect(buildTournament([]).getScore()).toEqual({
      wins: 0,
      losses: 0,
      diff: "+0",
    });
  });

  it("scores single-game matchups by their per-game point totals", () => {
    const tournament = buildTournament([
      { matches: [game(4, 2)] as any }, // win, +2
      { matches: [game(1, 3)] as any }, // loss, -2
      { matches: [game(2, 2)] as any }, // tie, +0
    ]);

    expect(tournament.getScore()).toEqual({
      wins: 1,
      losses: 1,
      diff: "+0",
    });
  });

  it("formats a negative differential without a plus sign", () => {
    const tournament = buildTournament([
      { matches: [game(0, 3)] as any },
      { matches: [game(1, 2)] as any },
    ]);

    expect(tournament.getScore()).toEqual({
      wins: 0,
      losses: 2,
      diff: "-4",
    });
  });

  it("scores by series wins when any matchup is best-of more than one game", () => {
    const tournament = buildTournament([
      // best-of-three series won 2-1 -> series win, diff +1
      { matches: [game(0, 0, "a"), game(0, 0, "b"), game(0, 0, "a")] as any },
      // single game counted by its winner under series scoring -> series loss, diff -1
      { matches: [game(5, 1, "b")] as any },
    ]);

    expect(tournament.getScore()).toEqual({
      wins: 1,
      losses: 1,
      diff: "+0",
    });
  });

  it("ignores matchups without any matches", () => {
    const tournament = buildTournament([
      { matches: [] as any },
      { matches: undefined as any },
      { matches: [game(3, 1)] as any },
    ]);

    expect(tournament.getScore()).toEqual({
      wins: 1,
      losses: 0,
      diff: "+2",
    });
  });
});
