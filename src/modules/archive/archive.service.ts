import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ExternalTournamentMapper } from "@modules/tournament/sub-modules/external-tournament/external-tournament.mapper";
import { ExternalTournamentService } from "@modules/tournament/sub-modules/external-tournament/external-tournament.service";
import { Injectable } from "@nestjs/common";
import { ArchiveMapper } from "./archive.mapper";
import { ArchiveRepository } from "./archive.repository";

@Injectable()
export class ArchiveService {
  constructor(
    private readonly archiveRepository: ArchiveRepository,
    private readonly tournamentService: ExternalTournamentService,
  ) {}

  async listArchivesForOwner(owner: string) {
    const [legacy, completedTournaments] = await Promise.all([
      this.archiveRepository.findAllByOwner(owner),
      this.tournamentService.getCompletedTournaments(owner),
    ]);

    const items = [
      ...legacy.map((archive) => ({
        completedAt: archive.createdAt,
        item: ArchiveMapper.toListItem(archive),
      })),
      ...completedTournaments.map((tournament) => ({
        completedAt: tournament.completedAt,
        item: ExternalTournamentMapper.toArchiveListItem(tournament),
      })),
    ];

    return items
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
      )
      .map(({ item }) => item);
  }

  async deleteArchive(teamId: string) {
    await this.archiveRepository.delete(teamId);
  }

  async getArchiveStats(teamId: string) {
    try {
      const archive = await this.archiveRepository.findById(teamId);
      return archive.computeStats();
    } catch (error) {
      if (!this.isArchiveMiss(error)) throw error;
      return this.tournamentService.getTournamentStatsById(teamId);
    }
  }

  private isArchiveMiss(error: unknown): boolean {
    return (
      error instanceof PDZError &&
      (error.code === ErrorCodes.ARCHIVE.NOT_FOUND.code ||
        error.code === ErrorCodes.VALIDATION.INVALID_PARAMS.code)
    );
  }
}
