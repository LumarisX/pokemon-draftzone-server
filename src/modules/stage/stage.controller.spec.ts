import { StageController } from "./stage.controller";
import { StageService } from "./stage.service";

describe("StageController", () => {
  let service: jest.Mocked<StageService>;
  let controller: StageController;

  beforeEach(() => {
    service = {
      listStages: jest.fn(),
    } as unknown as jest.Mocked<StageService>;
    controller = new StageController(service);
  });

  it("listStages forwards league/tournament keys and the caller", async () => {
    const stages = [{ _id: "stage-1" }];
    service.listStages.mockResolvedValue(stages as any);

    const result = await controller.listStages(
      "league-1",
      "tournament-1",
      "auth0|owner",
    );

    expect(service.listStages).toHaveBeenCalledWith(
      "league-1",
      "tournament-1",
      "auth0|owner",
    );
    expect(result).toBe(stages);
  });

  it("exposes no stage-scoped write routes", () => {
    const routes = Object.getOwnPropertyNames(StageController.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(routes).toEqual(["listStages"]);
  });
});
