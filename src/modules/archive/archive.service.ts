import { Injectable } from "@nestjs/common";
import { ArchiveMapper } from "./archive.mapper";
import { ArchiveRepository } from "./archive.repository";

@Injectable()
export class ArchiveService {
  constructor(private readonly archiveRepository: ArchiveRepository) {}

  async listArchivesForOwner(owner: string) {
    const archives = await this.archiveRepository.findAllByOwner(owner);
    return archives.map((archive) => ArchiveMapper.toListItem(archive));
  }

  async deleteArchive(teamId: string) {
    await this.archiveRepository.delete(teamId);
  }

  async getArchiveStats(teamId: string) {
    const archive = await this.archiveRepository.findById(teamId);
    return archive.computeStats();
  }
}
