import { StageController } from "./stage.controller";
import { StageService } from "./stage.service";

describe("StageController", () => {
  let service: jest.Mocked<StageService>;
  let controller: StageController;

  beforeEach(() => {
    service = {
      listStages: jest.fn(),
      createStage: jest.fn(),
      getSchedule: jest.fn(),
      getStandings: jest.fn(),
      getTrades: jest.fn(),
      createTrade: jest.fn(),
      updateMatchup: jest.fn(),
      setPools: jest.fn(),
      advanceCurrentRound: jest.fn(),
    } as unknown as jest.Mocked<StageService>;
    controller = new StageController(service);
  });

  it("listStages forwards league/tournament keys", async () => {
    const stages = [{ _id: "stage-1" }];
    service.listStages.mockResolvedValue(stages as any);

    const result = await controller.listStages("league-1", "tournament-1");

    expect(service.listStages).toHaveBeenCalledWith("league-1", "tournament-1");
    expect(result).toBe(stages);
  });

  it("createStage forwards keys, sub, and body", async () => {
    const body = { order: 1, name: "Regular Season", type: "round-robin" } as any;
    const created = { _id: "stage-1" };
    service.createStage.mockResolvedValue(created as any);

    const result = await controller.createStage("league-1", "tournament-1", "auth0|owner", body);

    expect(service.createStage).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(created);
  });

  it("getSchedule forwards stageId, teamId, and round query params", async () => {
    const schedule = { rounds: [] };
    service.getSchedule.mockResolvedValue(schedule as any);

    const result = await controller.getSchedule("stage-1", "team-1", "current");

    expect(service.getSchedule).toHaveBeenCalledWith("stage-1", "team-1", "current");
    expect(result).toBe(schedule);
  });

  it("getStandings forwards stageId", async () => {
    const standings = { coachStandings: {} };
    service.getStandings.mockResolvedValue(standings as any);

    const result = await controller.getStandings("stage-1");

    expect(service.getStandings).toHaveBeenCalledWith("stage-1");
    expect(result).toBe(standings);
  });

  it("getTrades forwards stageId and teamId", async () => {
    const trades = { rounds: [] };
    service.getTrades.mockResolvedValue(trades as any);

    const result = await controller.getTrades("stage-1", "team-1");

    expect(service.getTrades).toHaveBeenCalledWith("stage-1", "team-1");
    expect(result).toBe(trades);
  });

  it("createTrade forwards keys, stageId, sub, and body", async () => {
    const body = { side1: { pokemon: [] }, side2: { pokemon: [] }, roundIndex: 0 } as any;
    const response = { message: "Trade processed successfully." };
    service.createTrade.mockResolvedValue(response);

    const result = await controller.createTrade(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );

    expect(service.createTrade).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(response);
  });

  it("updateMatchup forwards keys, stageId, matchupId, sub, and body", async () => {
    const body = { matches: [] } as any;
    const response = { message: "Schedule updated." };
    service.updateMatchup.mockResolvedValue(response);

    const result = await controller.updateMatchup(
      "league-1",
      "tournament-1",
      "stage-1",
      "matchup-1",
      "auth0|owner",
      body,
    );

    expect(service.updateMatchup).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "stage-1",
      "matchup-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(response);
  });

  it("setPools forwards keys, stageId, sub, and body", async () => {
    const body = { pools: [] };
    const response = { _id: "stage-1" };
    service.setPools.mockResolvedValue(response as any);

    const result = await controller.setPools(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );

    expect(service.setPools).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(response);
  });

  it("advanceCurrentRound forwards keys, stageId, sub, and body", async () => {
    const body = { currentRoundIndex: 2 };
    const response = { _id: "stage-1", currentRoundIndex: 2 };
    service.advanceCurrentRound.mockResolvedValue(response as any);

    const result = await controller.advanceCurrentRound(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );

    expect(service.advanceCurrentRound).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "stage-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(response);
  });
});
