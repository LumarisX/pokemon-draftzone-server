import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { DraftData } from "../../models/draft/draft.model";
import { getMatchupsByDraftId } from "../../services/database-services/matchup.service";
import { ArchiveV2 } from "./archive.domain";
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

  /**
   * Not currently wired to any route (draft-to-archive conversion is
   * commented out in the legacy draft route), kept for when that flow is
   * reactivated.
   */
  async createFromDraft(draft: DraftData & { _id: Types.ObjectId }) {
    const matchups = await getMatchupsByDraftId(draft._id);
    const archive = ArchiveV2.fromDraft(draft, matchups);
    return this.archiveRepository.createV2(archive);
  }
}
