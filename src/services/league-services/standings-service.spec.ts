import { Types } from "mongoose";
import { calculateDivisionCoachStandings } from "./standings-service";

describe("calculateDivisionCoachStandings", () => {
  it("marks both teams as losses for double forfeits", async () => {
    const stageId = new Types.ObjectId();
    const team1Id = new Types.ObjectId();
    const team2Id = new Types.ObjectId();

    const team1 = {
      _id: team1Id,
      coach: {
        teamName: "Team One",
        name: "Coach One",
        logo: "",
      },
    };

    const team2 = {
      _id: team2Id,
      coach: {
        teamName: "Team Two",
        name: "Coach Two",
        logo: "",
      },
    };

    const division = {
      teams: [team1, team2],
      stages: [{ _id: stageId }],
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
        stage: { _id: stageId },
        forfeit: true,
        winner: "draw",
        results: [],
      },
    ];

    const { coachStandings } = await calculateDivisionCoachStandings(
      matchups as any,
      division as any,
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
