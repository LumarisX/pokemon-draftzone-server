import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { RevisionKind } from "./tier-list-revision.schema";
import { TierListRevisionRepository } from "./tier-list-revision.repository";
import { TierList } from "./tier-list.domain";
import { TierListRepository } from "./tier-list.repository";
import {
  applyState,
  diffStates,
  summarizeChanges,
  TierListChange,
  TierListState,
  toState,
} from "./tier-list.state";

export type SavedContent = {
  version: number;
  changes: TierListChange[];
  summary: string;
};

@Injectable()
export class TierListHistoryService {
  constructor(
    private readonly tierListRepo: TierListRepository,
    private readonly revisionRepo: TierListRevisionRepository,
  ) {}

  async saveState(input: {
    tierList: TierList;
    next: TierListState;
    expectedVersion: number;
    actor: string;
    actorName?: string;
    kind: RevisionKind;
    restoredFrom?: number;
    summaryPrefix?: string;
  }): Promise<SavedContent> {
    const { tierList } = input;
    const before = toState(tierList);
    const changes = diffStates(before, input.next);
    const described = summarizeChanges(changes);
    const summary =
      input.kind === "revert" && input.restoredFrom !== undefined
        ? `Restored version ${input.restoredFrom}: ${described.charAt(0).toLowerCase()}${described.slice(1)}`
        : input.summaryPrefix
          ? `${input.summaryPrefix}: ${described.charAt(0).toLowerCase()}${described.slice(1)}`
          : described;

    if (input.expectedVersion !== tierList.version)
      throw new PDZError(ErrorCodes.TIER_LIST.STALE);
    if (!changes.length && input.kind !== "revert")
      return { version: tierList.version, changes, summary };

    if (tierList.version === 0)
      await this.revisionRepo.create({
        tierListId: tierList.id,
        version: 0,
        actor: tierList.createdBy,
        kind: "create",
        summary: "Before history started",
        changes: [],
        state: before,
      });

    applyState(tierList, input.next);
    const version = await this.tierListRepo.saveContent(
      tierList,
      input.expectedVersion,
    );
    tierList.version = version;

    await this.revisionRepo.create({
      tierListId: tierList.id,
      version,
      actor: input.actor,
      actorName: input.actorName,
      kind: input.kind,
      summary,
      changes,
      state: input.next,
      restoredFrom: input.restoredFrom,
    });

    return { version, changes, summary };
  }

  async recordCreated(input: {
    tierList: TierList;
    actor: string;
    actorName?: string;
    kind: RevisionKind;
    summary: string;
  }): Promise<void> {
    await this.revisionRepo.create({
      tierListId: input.tierList.id,
      version: input.tierList.version,
      actor: input.actor,
      actorName: input.actorName,
      kind: input.kind,
      summary: input.summary,
      changes: [],
      state: toState(input.tierList),
    });
  }

  async stateAt(
    tierList: TierList,
    version: number,
  ): Promise<TierListState | null> {
    if (version === tierList.version) return toState(tierList);
    const revision = await this.revisionRepo.find(tierList.id, version);
    return revision?.state ?? null;
  }

  async list(tierListId: string, before?: number, limit = 30) {
    const revisions = await this.revisionRepo.list(tierListId, limit + 1, before);
    const page = revisions.slice(0, limit);
    return {
      revisions: page.map((revision) => ({
        version: revision.version,
        at: revision.createdAt,
        actorName: revision.actorName ?? null,
        kind: revision.kind,
        summary: revision.summary,
        changeCount: revision.changes?.length ?? 0,
        restoredFrom: revision.restoredFrom,
      })),
      next: revisions.length > limit ? page[page.length - 1].version : null,
    };
  }

  async revision(tierListId: string, version: number) {
    const revision = await this.revisionRepo.find(tierListId, version);
    if (!revision) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return revision;
  }
}
