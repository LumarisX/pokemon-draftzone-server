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

  /**
   * Two sources, and there will be two for a long time. Leagues archived from
   * now on stay in `drafts` behind the `archivedAt` flag; the 1665 documents in
   * `archives` were written by the legacy server and are frozen there, because
   * the pre-2025-11 half of them records only the owner's own stats and has no
   * opponent roster to rebuild a matchup from.
   */
  async listArchivesForOwner(owner: string) {
    const [legacy, archivedTournaments] = await Promise.all([
      this.archiveRepository.findAllByOwner(owner),
      this.tournamentService.getArchivedTournaments(owner),
    ]);

    const items = [
      ...legacy.map((archive) => ({
        createdAt: archive.createdAt,
        item: ArchiveMapper.toListItem(archive),
      })),
      ...archivedTournaments.map((tournament) => ({
        createdAt: tournament.archivedAt,
        item: ExternalTournamentMapper.toArchiveListItem(tournament),
      })),
    ];

    return items
      .sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      )
      .map(({ item }) => item);
  }

  async deleteArchive(teamId: string) {
    await this.archiveRepository.delete(teamId);
  }

  /**
   * The list mixes both sources, so a stats request can arrive with either a
   * legacy archive id or the ObjectId of a flagged draft. Legacy wins the
   * lookup; a miss falls through to the live collection rather than 404ing.
   */
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
