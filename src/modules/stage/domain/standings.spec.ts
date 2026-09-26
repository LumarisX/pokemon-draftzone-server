import { Types } from "mongoose";
import {
  calculateTeamStandings,
  calculateTeamScore,
} from "./standings";

describe("calculateTeamStandings", () => {
  it("marks both teams as losses for double forfeits", async () => {
    const roundId = new Types.ObjectId();
    const team1Id = new Types.ObjectId();
    const team2Id = new Types.ObjectId();

    const team1 = {
      _id: team1Id,
      teamName: "Team One",
      logo: "",
      coach: {
        name: "Coach One",
      },
      primaryCoach: {
        name: "Coach One",
      },
    };

    const team2 = {
      _id: team2Id,
      teamName: "Team Two",
      logo: "",
      coach: {
        name: "Coach Two",
      },
      primaryCoach: {
        name: "Coach Two",
      },
    };

    const stage = {
      teams: [team1, team2],
    };

    const tournament = {
      diffMode: "pokemon",
      rounds: [{ _id: roundId }],
      forfeit: {
        gameDiff: 1,
        pokemonDiff: 6,
      },
    };

    const matchups = [
      {
        side1: {
          team: team1,
          score: 0,
        },
        side2: {
          team: team2,
          score: 0,
        },
        round: roundId,
        forfeit: true,
        winner: "draw",
        results: [],
      },
    ];

    const { teamStandings } = await calculateTeamStandings(
      matchups as any,
      stage as any,
      tournament as any,
    );

    const teamOneStanding = teamStandings.find(
      (team) => team.name === "Team One",
    );
    const teamTwoStanding = teamStandings.find(
      (team) => team.name === "Team Two",
    );

    expect(teamOneStanding).toBeDefined();
    expect(teamTwoStanding).toBeDefined();

    expect(teamOneStanding?.wins).toBe(0);
    expect(teamTwoStanding?.wins).toBe(0);
    expect(teamOneStanding?.losses).toBe(1);
    expect(teamTwoStanding?.losses).toBe(1);

    expect(teamOneStanding?.results[0]).toEqual({ outcome: "ff", score: -6 });
    expect(teamTwoStanding?.results[0]).toEqual({ outcome: "ff", score: -6 });
  });

  it("gives the known team a scheduled square when its opponent slot is unresolved", async () => {
    const roundId = new Types.ObjectId();
    const team1Id = new Types.ObjectId();

    const team1 = {
      _id: team1Id,
      teamName: "Team One",
      logo: "",
      coach: {
        name: "Coach One",
      },
      primaryCoach: {
        name: "Coach One",
      },
    };

    const stage = {
      teams: [team1],
    };

    const tournament = {
      diffMode: "pokemon",
      rounds: [{ _id: roundId }],
    };

    const matchups = [
      {
        side1: {
          team: team1,
          score: 0,
        },
        side2: {
          slot: { type: "winner", matchId: new Types.ObjectId().toString() },
        },
        round: roundId,
        results: [],
      },
    ];

    const { teamStandings } = await calculateTeamStandings(
      matchups as any,
      stage as any,
      tournament as any,
    );

    const teamOneStanding = teamStandings.find(
      (team) => team.name === "Team One",
    );

    expect(teamOneStanding).toBeDefined();
    expect(teamOneStanding?.wins).toBe(0);
    expect(teamOneStanding?.losses).toBe(0);
    expect(teamOneStanding?.results[0]).toEqual({ outcome: "t", score: 0 });
  });
});

describe("calculateTeamStandings ranking", () => {
  const roundId = new Types.ObjectId();

  function team(name: string) {
    return {
      _id: new Types.ObjectId(),
      teamName: name,
      slug: name.toLowerCase(),
      primaryCoach: { name: `${name} coach` },
    };
  }

  function played(
    side1: ReturnType<typeof team>,
    side2: ReturnType<typeof team>,
    winner: "side1" | "side2" | "draw",
    games: [number, number],
    left: [number, number] = [0, 0],
  ) {
    return {
      side1: { team: side1, score: games[0] },
      side2: { team: side2, score: games[1] },
      round: roundId,
      winner,
      results: [
        {
          winner: winner === "draw" ? "draw" : winner,
          side1: { score: left[0] },
          side2: { score: left[1] },
        },
      ],
    };
  }

  it("records a draw and ranks by points", async () => {
    const a = team("A");
    const b = team("B");
    const c = team("C");

    const { teamStandings, rules } = await calculateTeamStandings(
      [played(a, b, "draw", [1, 1]), played(c, b, "side2", [0, 2])] as any,
      { teams: [a, b, c] } as any,
      { diffMode: "pokemon", rounds: [{ _id: roundId }] } as any,
    );

    expect(rules.points).toEqual({ win: 3, draw: 1, loss: 0 });
    expect(teamStandings.map((row) => [row.name, row.points])).toEqual([
      ["B", 4],
      ["A", 1],
      ["C", 0],
    ]);
    expect(teamStandings[1]).toMatchObject({ wins: 0, draws: 1, losses: 0 });
    expect(teamStandings[1].results[0]).toEqual({ outcome: "d", score: 0 });
  });

  it("orders ties by the diff mode's differential first", async () => {
    const bigGames = team("BigGames");
    const bigPokemon = team("BigPokemon");
    const loser1 = team("Loser1");
    const loser2 = team("Loser2");
    const matchups = [
      played(bigGames, loser1, "side1", [3, 0], [1, 0]),
      played(bigPokemon, loser2, "side1", [2, 1], [6, 0]),
    ];
    const stage = {
      teams: [bigGames, bigPokemon, loser1, loser2],
    };
    const rounds = [{ _id: roundId }];

    const byPokemon = await calculateTeamStandings(
      matchups as any,
      stage as any,
      { diffMode: "pokemon", rounds } as any,
    );
    const byGame = await calculateTeamStandings(
      matchups as any,
      stage as any,
      { diffMode: "game", rounds } as any,
    );

    expect(byPokemon.teamStandings[0].name).toBe("BigPokemon");
    expect(byGame.teamStandings[0].name).toBe("BigGames");
  });

  it("follows the organizer's tiebreaker order over the diff mode", async () => {
    const bigGames = team("BigGames");
    const bigPokemon = team("BigPokemon");
    const loser1 = team("Loser1");
    const loser2 = team("Loser2");

    const { teamStandings } = await calculateTeamStandings(
      [
        played(bigGames, loser1, "side1", [3, 0], [1, 0]),
        played(bigPokemon, loser2, "side1", [2, 1], [6, 0]),
      ] as any,
      {
        teams: [bigGames, bigPokemon, loser1, loser2],
      } as any,
      {
        diffMode: "pokemon",
        rounds: [{ _id: roundId }],
        standingsRules: { tiebreakers: ["gameDiff"] },
      } as any,
    );

    expect(teamStandings[0].name).toBe("BigGames");
  });
});

describe("calculateTeamScore", () => {
  it("marks a team as a loss for double forfeits", async () => {
    const roundId = new Types.ObjectId();
    const team1Id = new Types.ObjectId();
    const team2Id = new Types.ObjectId();

    const team1 = {
      _id: team1Id,
      teamName: "Team One",
      logo: "",
      coach: {
        name: "Coach One",
      },
      primaryCoach: {
        name: "Coach One",
      },
    };

    const team2 = {
      _id: team2Id,
      teamName: "Team Two",
      logo: "",
      coach: {
        name: "Coach Two",
      },
      primaryCoach: {
        name: "Coach Two",
      },
    };

    const matchups = [
      {
        side1: {
          team: team1,
          score: 0,
        },
        side2: {
          team: team2,
          score: 0,
        },
        round: roundId,
        forfeit: true,
        winner: "draw",
        results: [],
      },
    ];

    const teamScore = await calculateTeamScore(
      matchups as any,
      [{ _id: roundId }] as any,
      team1 as any,
      { diffMode: "pokemon", forfeit: { gameDiff: 1, pokemonDiff: 6 } },
    );

    expect(teamScore.wins).toBe(0);
    expect(teamScore.losses).toBe(1);
    expect(teamScore.unplayed).toBe(0);
    expect(teamScore.pokemonDiff).toBe(-6);
    expect(teamScore.gameDiff).toBe(-1);
    expect(teamScore.results[0]).toEqual({ outcome: "ff", score: -6 });
  });
});
