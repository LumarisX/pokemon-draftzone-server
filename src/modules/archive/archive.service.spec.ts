import { ArchiveMapper } from "./archive.mapper";
import { ArchiveRepository } from "./archive.repository";
import { ArchiveService } from "./archive.service";

jest.mock("./archive.mapper", () => ({
  ArchiveMapper: {
    toListItem: jest.fn(),
  },
}));

const mockedMapper = ArchiveMapper as jest.Mocked<typeof ArchiveMapper>;

describe("ArchiveService", () => {
  let repository: jest.Mocked<ArchiveRepository>;
  let service: ArchiveService;

  beforeEach(() => {
    repository = {
      findAllByOwner: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      createV2: jest.fn(),
    } as unknown as jest.Mocked<ArchiveRepository>;
    service = new ArchiveService(repository);
  });

  describe("listArchivesForOwner", () => {
    it("fetches by owner and maps each archive to a list item", async () => {
      const archiveA = { leagueName: "A" } as any;
      const archiveB = { leagueName: "B" } as any;
      repository.findAllByOwner.mockResolvedValue([archiveA, archiveB]);
      mockedMapper.toListItem
        .mockReturnValueOnce({ leagueName: "A-mapped" } as any)
        .mockReturnValueOnce({ leagueName: "B-mapped" } as any);

      const result = await service.listArchivesForOwner("auth0|owner");

      expect(repository.findAllByOwner).toHaveBeenCalledWith("auth0|owner");
      expect(mockedMapper.toListItem.mock.calls[0][0]).toBe(archiveA);
      expect(mockedMapper.toListItem.mock.calls[1][0]).toBe(archiveB);
      expect(result).toEqual([{ leagueName: "A-mapped" }, { leagueName: "B-mapped" }]);
    });

    it("returns an empty array when the owner has no archives", async () => {
      repository.findAllByOwner.mockResolvedValue([]);

      await expect(service.listArchivesForOwner("auth0|owner")).resolves.toEqual([]);
    });
  });

  describe("deleteArchive", () => {
    it("delegates to the repository", async () => {
      await service.deleteArchive("team-1");

      expect(repository.delete).toHaveBeenCalledWith("team-1");
    });
  });

  describe("getArchiveStats", () => {
    it("fetches the archive by id and returns its computed stats", async () => {
      const stats = { pokemon: [] };
      const archive = { computeStats: jest.fn().mockReturnValue(stats) } as any;
      repository.findById.mockResolvedValue(archive);

      const result = await service.getArchiveStats("team-1");

      expect(repository.findById).toHaveBeenCalledWith("team-1");
      expect(archive.computeStats).toHaveBeenCalledWith();
      expect(result).toBe(stats);
    });
  });
});
