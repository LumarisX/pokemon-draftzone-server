import { StageService } from "./stage.service";
import { TournamentMatchupController } from "./tournament-matchup.controller";

describe("TournamentMatchupController", () => {
  let service: jest.Mocked<StageService>;
  let controller: TournamentMatchupController;

  beforeEach(() => {
    service = {
      getMatchupDetail: jest.fn(),
      getMatchupAnalysis: jest.fn(),
      submitMatchupReport: jest.fn(),
      reviewMatchupReport: jest.fn(),
      updateMatchup: jest.fn(),
    } as unknown as jest.Mocked<StageService>;
    controller = new TournamentMatchupController(service);
  });

  it("getMatchupDetail forwards the slugs and the caller", async () => {
    const detail = { id: "matchup-1" };
    service.getMatchupDetail.mockResolvedValue(detail as any);

    const result = await controller.getMatchupDetail(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );

    expect(service.getMatchupDetail).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );
    expect(result).toBe(detail);
  });

  it("getMatchupAnalysis forwards the slugs and the caller", async () => {
    const analysis = { summary: {} };
    service.getMatchupAnalysis.mockResolvedValue(analysis as any);

    const result = await controller.getMatchupAnalysis(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );

    expect(service.getMatchupAnalysis).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );
    expect(result).toBe(analysis);
  });

  it("submitMatchupReport forwards the slugs, sub, and body", async () => {
    const body = { matches: [] } as any;
    const response = { message: "Result submitted for review." };
    service.submitMatchupReport.mockResolvedValue(response as any);

    const result = await controller.submitMatchupReport(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
      body,
    );

    expect(service.submitMatchupReport).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|coach",
      body,
    );
    expect(result).toBe(response);
  });

  it.each([
    ["approve", true],
    ["reject", false],
  ])("%s review passes the decision through", async (decision, approve) => {
    const response = { message: "Done." };
    service.reviewMatchupReport.mockResolvedValue(response as any);

    const call =
      decision === "approve"
        ? controller.approveMatchupReport.bind(controller)
        : controller.rejectMatchupReport.bind(controller);
    const result = await call(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|owner",
    );

    expect(service.reviewMatchupReport).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|owner",
      approve,
    );
    expect(result).toBe(response);
  });

  it("updateMatchup forwards the slugs, sub, and body", async () => {
    const body = { matches: [] } as any;
    const response = { message: "Schedule updated." };
    service.updateMatchup.mockResolvedValue(response as any);

    const result = await controller.updateMatchup(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|owner",
      body,
    );

    expect(service.updateMatchup).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "matchup-1",
      "auth0|owner",
      body,
    );
    expect(result).toBe(response);
  });
});
