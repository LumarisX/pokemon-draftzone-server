import { LeagueController } from "./league.controller";
import { LeagueService } from "./league.service";

describe("LeagueController", () => {
  let service: jest.Mocked<LeagueService>;
  let controller: LeagueController;

  beforeEach(() => {
    service = {
      getLeagueSummary: jest.fn(),
    } as unknown as jest.Mocked<LeagueService>;
    controller = new LeagueController(service);
  });

  it("getLeague forwards the league key", async () => {
    const summary = { name: "Spring League" } as any;
    service.getLeagueSummary.mockResolvedValue(summary);

    const result = await controller.getLeague("springleague");

    expect(service.getLeagueSummary).toHaveBeenCalledWith("springleague");
    expect(result).toBe(summary);
  });
});
