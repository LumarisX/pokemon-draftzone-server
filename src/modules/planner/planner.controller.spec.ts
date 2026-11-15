import { getTeamCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { PlannerController } from "./planner.controller";
import { PlannerService } from "./planner.service";

jest.mock("@modules/matchup/domain/coverage", () => ({
  getTeamCoverage: jest.fn(),
}));
jest.mock("@modules/matchup/domain/movechart", () => ({
  getTeamMoves: jest.fn(),
}));
jest.mock("@modules/matchup/domain/summary", () => ({
  summarizeTeam: jest.fn(),
}));
jest.mock("@modules/matchup/domain/typechart", () => ({
  getTeamTypechart: jest.fn(),
}));

const mockedGetTeamCoverage = getTeamCoverage as jest.Mock;
const mockedGetTeamMoves = getTeamMoves as jest.Mock;
const mockedSummarizeTeam = summarizeTeam as jest.Mock;
const mockedGetTeamTypechart = getTeamTypechart as jest.Mock;

describe("PlannerController", () => {
  let controller: PlannerController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTeamCoverage.mockResolvedValue({ coverage: true });
    mockedGetTeamMoves.mockResolvedValue({ moves: true });
    mockedSummarizeTeam.mockReturnValue({ summary: true });
    mockedGetTeamTypechart.mockReturnValue({ typechart: true });
    controller = new PlannerController({} as PlannerService);
  });

  describe("getPlanner", () => {
    it("splits the comma-separated team string and resolves each id against the requested ruleset", async () => {
      await controller.getPlanner({
        ruleset: "Gen9 NatDex",
        team: "pikachu,charizard",
      });

      const team = mockedSummarizeTeam.mock.calls[0][0];
      expect(team.map((p: any) => p.id)).toEqual(["pikachu", "charizard"]);
      expect(team.map((p: any) => p.name)).toEqual(["Pikachu", "Charizard"]);
    });

    it("builds a single-entry team when the team string has no commas", async () => {
      await controller.getPlanner({ ruleset: "Gen9 NatDex", team: "pikachu" });

      const team = mockedSummarizeTeam.mock.calls[0][0];
      expect(team).toHaveLength(1);
      expect(team[0].id).toBe("pikachu");
    });

    it("forwards the same constructed team to typechart, movechart, and coverage", async () => {
      await controller.getPlanner({
        ruleset: "Gen9 NatDex",
        team: "pikachu,charizard",
      });

      const team = mockedSummarizeTeam.mock.calls[0][0];
      expect(mockedGetTeamTypechart).toHaveBeenCalledWith(team);
      expect(mockedGetTeamMoves).toHaveBeenCalledWith(team);
      expect(mockedGetTeamCoverage).toHaveBeenCalledWith(team);
    });

    it("assembles the response from each collaborator, with an always-empty recommended list", async () => {
      const result = await controller.getPlanner({
        ruleset: "Gen9 NatDex",
        team: "pikachu",
      });

      expect(result).toEqual({
        typechart: { typechart: true },
        recommended: [],
        summary: { summary: true },
        movechart: { moves: true },
        coverage: { coverage: true },
      });
    });

    it("rejects with SPECIES.NOT_FOUND when the team string contains an unknown Pokemon id", async () => {
      await expect(
        controller.getPlanner({
          ruleset: "Gen9 NatDex",
          team: "notarealpokemon",
        }),
      ).rejects.toMatchObject({ code: "SPC-001" });
    });

    it("rejects with VAL-002 before analysis when the team is empty", async () => {
      await expect(
        controller.getPlanner({ ruleset: "Gen9 NatDex", team: " , ," }),
      ).rejects.toMatchObject({ code: "VAL-002" });
      expect(mockedSummarizeTeam).not.toHaveBeenCalled();
    });

    it("rejects with VAL-002 before analysis when the team has 21 entries", async () => {
      const team = Array.from({ length: 21 }, () => "pikachu").join(",");
      await expect(
        controller.getPlanner({ ruleset: "Gen9 NatDex", team }),
      ).rejects.toMatchObject({ code: "VAL-002" });
      expect(mockedSummarizeTeam).not.toHaveBeenCalled();
    });

    it("rejects with FORMAT.NOT_FOUND-style error when the ruleset id is unknown", async () => {
      let error: unknown;
      try {
        await controller.getPlanner({
          ruleset: "NotARealRuleset",
          team: "pikachu",
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
    });
  });
});
