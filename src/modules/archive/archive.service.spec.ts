import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ExternalTournamentMapper } from "@modules/tournament/sub-modules/external-tournament/external-tournament.mapper";
import { ExternalTournamentService } from "@modules/tournament/sub-modules/external-tournament/external-tournament.service";
import { ArchiveMapper } from "./archive.mapper";
import { ArchiveRepository } from "./archive.repository";
import { ArchiveService } from "./archive.service";

jest.mock("./archive.mapper", () => ({
  ArchiveMapper: {
    toListItem: jest.fn(),
  },
}));

jest.mock(
  "@modules/tournament/sub-modules/external-tournament/external-tournament.mapper",
  () => ({
    ExternalTournamentMapper: {
      toArchiveListItem: jest.fn(),
    },
  }),
);

const mockedMapper = ArchiveMapper as jest.Mocked<typeof ArchiveMapper>;
const mockedTournamentMapper = ExternalTournamentMapper as jest.Mocked<
  typeof ExternalTournamentMapper
>;

describe("ArchiveService", () => {
  let repository: jest.Mocked<ArchiveRepository>;
  let tournamentService: jest.Mocked<ExternalTournamentService>;
  let service: ArchiveService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      findAllByOwner: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      createV2: jest.fn(),
    } as unknown as jest.Mocked<ArchiveRepository>;
    tournamentService = {
      getArchivedTournaments: jest.fn().mockResolvedValue([]),
      getTournamentStatsById: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentService>;
    service = new ArchiveService(repository, tournamentService);
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
      expect(result).toEqual([
        { leagueName: "A-mapped" },
        { leagueName: "B-mapped" },
      ]);
    });

    it("returns an empty array when the owner has no archives", async () => {
      repository.findAllByOwner.mockResolvedValue([]);

      await expect(
        service.listArchivesForOwner("auth0|owner"),
      ).resolves.toEqual([]);
    });

    it("merges flagged drafts with legacy archives, newest first", async () => {
      repository.findAllByOwner.mockResolvedValue([
        { createdAt: new Date("2025-01-01") } as any,
        { createdAt: new Date("2026-03-01") } as any,
      ]);
      tournamentService.getArchivedTournaments.mockResolvedValue([
        { archivedAt: new Date("2026-08-01") } as any,
      ]);
      mockedMapper.toListItem
        .mockReturnValueOnce({ leagueName: "old-legacy" } as any)
        .mockReturnValueOnce({ leagueName: "new-legacy" } as any);
      mockedTournamentMapper.toArchiveListItem.mockReturnValue({
        leagueName: "flagged",
      } as any);

      const result = await service.listArchivesForOwner("auth0|owner");

      expect(result).toEqual([
        { leagueName: "flagged" },
        { leagueName: "new-legacy" },
        { leagueName: "old-legacy" },
      ]);
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

    it("falls back to the live collection when no legacy archive matches", async () => {
      const stats = { pokemon: [] };
      repository.findById.mockRejectedValue(
        new PDZError(ErrorCodes.ARCHIVE.NOT_FOUND),
      );
      tournamentService.getTournamentStatsById.mockResolvedValue(stats as any);

      const result = await service.getArchiveStats("team-1");

      expect(tournamentService.getTournamentStatsById).toHaveBeenCalledWith(
        "team-1",
      );
      expect(result).toBe(stats);
    });

    it("rethrows errors that are not an archive miss", async () => {
      const failure = new Error("connection reset");
      repository.findById.mockRejectedValue(failure);

      await expect(service.getArchiveStats("team-1")).rejects.toBe(failure);
      expect(tournamentService.getTournamentStatsById).not.toHaveBeenCalled();
    });
  });
});
