import { Types } from "mongoose";
import {
  calculateDivisionCoachStandings,
  calculateTeamScore,
} from "./standings";

describe("calculateDivisionCoachStandings", () => {
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
    };

    const team2 = {
      _id: team2Id,
      teamName: "Team Two",
      logo: "",
      coach: {
        name: "Coach Two",
      },
    };

    const stage = {
      teams: [team1, team2],
      rounds: [{ _id: roundId }],
    };

    const tournament = {
      diffMode: "pokemon",
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

    const { coachStandings } = await calculateDivisionCoachStandings(
      matchups as any,
      stage as any,
      tournament as any,
    );

    const teamOneStanding = coachStandings.find(
      (team) => team.name === "Team One",
    );
    const teamTwoStanding = coachStandings.find(
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
    };

    const team2 = {
      _id: team2Id,
      teamName: "Team Two",
      logo: "",
      coach: {
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
      {
        gameDiff: 1,
        pokemonDiff: 6,
      },
    );

    expect(teamScore.wins).toBe(0);
    expect(teamScore.losses).toBe(1);
    expect(teamScore.unplayed).toBe(0);
    expect(teamScore.pokemonDiff).toBe(-6);
    expect(teamScore.gameDiff).toBe(-1);
    expect(teamScore.results[0]).toEqual({ outcome: "ff", score: -6 });
  });
});
