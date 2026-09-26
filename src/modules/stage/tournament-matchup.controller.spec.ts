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
    } as unknown as jest.Mocked<StageService>;
    controller = new TournamentMatchupController(service);
  });

  it("getMatchupDetail forwards the slugs and the caller", async () => {
    const detail = { id: "matchup-1" };
    service.getMatchupDetail.mockResolvedValue(detail as any);

    const result = await controller.getMatchupDetail(      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );

    expect(service.getMatchupDetail).toHaveBeenCalledWith(      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );
    expect(result).toBe(detail);
  });

  it("getMatchupAnalysis forwards the slugs and the caller", async () => {
    const analysis = { summary: {} };
    service.getMatchupAnalysis.mockResolvedValue(analysis as any);

    const result = await controller.getMatchupAnalysis(      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );

    expect(service.getMatchupAnalysis).toHaveBeenCalledWith(      "tournament-1",
      "matchup-1",
      "auth0|coach",
    );
    expect(result).toBe(analysis);
  });

  it("submitMatchupReport forwards the slugs, sub, and body", async () => {
    const body = { matches: [] } as any;
    const response = { message: "Result submitted for review." };
    service.submitMatchupReport.mockResolvedValue(response as any);

    const result = await controller.submitMatchupReport(      "tournament-1",
      "matchup-1",
      "auth0|coach",
      body,
    );

    expect(service.submitMatchupReport).toHaveBeenCalledWith(      "tournament-1",
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
    const result = await call(      "tournament-1",
      "matchup-1",
      "auth0|owner",
    );

    expect(service.reviewMatchupReport).toHaveBeenCalledWith(      "tournament-1",
      "matchup-1",
      "auth0|owner",
      approve,
    );
    expect(result).toBe(response);
  });

  it("no longer exposes a bare update route", () => {
    expect(
      (controller as unknown as Record<string, unknown>)["updateMatchup"],
    ).toBeUndefined();
  });
});
