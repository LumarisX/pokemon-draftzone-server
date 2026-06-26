import { ArchiveController } from "./archive.controller";
import { ArchiveService } from "./archive.service";

describe("ArchiveController", () => {
  let service: jest.Mocked<ArchiveService>;
  let controller: ArchiveController;

  beforeEach(() => {
    service = {
      listArchivesForOwner: jest.fn(),
      deleteArchive: jest.fn(),
      getArchiveStats: jest.fn(),
    } as unknown as jest.Mocked<ArchiveService>;
    controller = new ArchiveController(service);
  });

  describe("listArchives", () => {
    it("forwards the authenticated sub", async () => {
      const archives = [{ leagueName: "Spring League" }] as any;
      service.listArchivesForOwner.mockResolvedValue(archives);

      const result = await controller.listArchives("auth0|owner");

      expect(service.listArchivesForOwner).toHaveBeenCalledWith("auth0|owner");
      expect(result).toBe(archives);
    });
  });

  describe("deleteArchive", () => {
    it("deletes by team id and returns a confirmation message", async () => {
      const result = await controller.deleteArchive("team-1");

      expect(service.deleteArchive).toHaveBeenCalledWith("team-1");
      expect(result).toEqual({ message: "Draft deleted" });
    });
  });

  describe("getArchiveStats", () => {
    it("forwards the team id and returns the service's result directly", async () => {
      const stats = { pokemon: [] };
      service.getArchiveStats.mockResolvedValue(stats);

      const result = await controller.getArchiveStats("team-1");

      expect(service.getArchiveStats).toHaveBeenCalledWith("team-1");
      expect(result).toBe(stats);
    });
  });
});
