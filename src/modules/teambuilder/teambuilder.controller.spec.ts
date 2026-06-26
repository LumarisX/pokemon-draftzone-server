import { TeambuilderController } from "./teambuilder.controller";
import { TeambuilderService } from "./teambuilder.service";

describe("TeambuilderController", () => {
  let service: jest.Mocked<TeambuilderService>;
  let controller: TeambuilderController;

  beforeEach(() => {
    service = {
      getPokemonData: jest.fn(),
    } as unknown as jest.Mocked<TeambuilderService>;
    controller = new TeambuilderController(service);
  });

  describe("getPokemonData", () => {
    it("throws MISSING_FIELD when id is omitted", async () => {
      await expect(
        controller.getPokemonData(undefined, "Gen9 NatDex"),
      ).rejects.toMatchObject({ code: "VAL-003" });
      expect(service.getPokemonData).not.toHaveBeenCalled();
    });

    it("throws MISSING_FIELD when ruleset is omitted", async () => {
      await expect(
        controller.getPokemonData("pikachu", undefined),
      ).rejects.toMatchObject({ code: "VAL-003" });
      expect(service.getPokemonData).not.toHaveBeenCalled();
    });

    it("forwards id and ruleset to the service when both are present", async () => {
      const data = { id: "pikachu" } as any;
      service.getPokemonData.mockResolvedValue(data);

      const result = await controller.getPokemonData("pikachu", "Gen9 NatDex");

      expect(service.getPokemonData).toHaveBeenCalledWith("pikachu", "Gen9 NatDex");
      expect(result).toBe(data);
    });
  });
});
