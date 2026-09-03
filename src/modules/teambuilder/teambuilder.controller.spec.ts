import { TeambuilderController } from "./teambuilder.controller";
import { TeambuilderService } from "./teambuilder.service";

describe("TeambuilderController", () => {
  let service: jest.Mocked<TeambuilderService>;
  let controller: TeambuilderController;

  beforeEach(() => {
    service = {
      getSpecies: jest.fn(),
      getProcessedLearnset: jest.fn(),
    } as unknown as jest.Mocked<TeambuilderService>;
    controller = new TeambuilderController(service);
  });

  describe("getSpecies", () => {
    it("throws MISSING_FIELD when ruleset is omitted", async () => {
      await expect(
        controller.getSpecies("pikachu", undefined),
      ).rejects.toMatchObject({ code: "VAL-003" });
      expect(service.getSpecies).not.toHaveBeenCalled();
    });

    it("forwards id and ruleset to the service", async () => {
      const data = { id: "pikachu" } as any;
      service.getSpecies.mockResolvedValue(data);

      const result = await controller.getSpecies("pikachu", "Gen9 NatDex");

      expect(service.getSpecies).toHaveBeenCalledWith(
        "pikachu",
        "Gen9 NatDex",
      );
      expect(result).toBe(data);
    });
  });

  describe("getLearnset", () => {
    it("throws MISSING_FIELD when ruleset is omitted", async () => {
      await expect(
        controller.getLearnset("pikachu", undefined),
      ).rejects.toMatchObject({ code: "VAL-003" });
      expect(service.getProcessedLearnset).not.toHaveBeenCalled();
    });

    it("splits the types query into the set shape the service expects", async () => {
      service.getProcessedLearnset.mockResolvedValue([]);

      await controller.getLearnset(
        "pikachu",
        "Gen9 NatDex",
        "Electric",
        "Electric",
        "Static",
      );

      expect(service.getProcessedLearnset).toHaveBeenCalledWith({
        ruleset: "Gen9 NatDex",
        pokemon: {
          id: "pikachu",
          types: ["Electric"],
          teraType: "Electric",
          ability: "Static",
          moves: [],
        },
      });
    });

    it("defaults types and ability when they are not supplied", async () => {
      service.getProcessedLearnset.mockResolvedValue([]);

      await controller.getLearnset("pikachu", "Gen9 NatDex");

      expect(service.getProcessedLearnset).toHaveBeenCalledWith(
        expect.objectContaining({
          pokemon: expect.objectContaining({ types: [], ability: "" }),
        }),
      );
    });
  });
});
