import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  RevisionKind,
  TierListRevisionDocument,
  TierListRevisionEntity,
} from "./tier-list-revision.schema";
import { TierListChange, TierListState } from "./tier-list.state";

export type NewRevision = {
  tierListId: string;
  version: number;
  actor: string;
  actorName?: string;
  kind: RevisionKind;
  summary: string;
  changes: TierListChange[];
  state: TierListState;
  restoredFrom?: number;
};

@Injectable()
export class TierListRevisionRepository {
  constructor(
    @InjectModel(TierListRevisionEntity.name)
    private readonly revisionModel: Model<TierListRevisionDocument>,
  ) {}

  async create(revision: NewRevision): Promise<void> {
    await this.revisionModel.create([
      {
        tierList: new Types.ObjectId(revision.tierListId),
        version: revision.version,
        actor: revision.actor,
        actorName: revision.actorName,
        kind: revision.kind,
        summary: revision.summary,
        changes: revision.changes,
        state: revision.state,
        restoredFrom: revision.restoredFrom,
      },
    ]);
  }

  async list(
    tierListId: string,
    limit: number,
    before?: number,
  ): Promise<TierListRevisionDocument[]> {
    return this.revisionModel
      .find({
        tierList: new Types.ObjectId(tierListId),
        ...(before !== undefined && { version: { $lt: before } }),
      })
      .select("-state")
      .sort({ version: -1 })
      .limit(limit)
      .exec();
  }

  async find(
    tierListId: string,
    version: number,
  ): Promise<TierListRevisionDocument | null> {
    return this.revisionModel
      .findOne({ tierList: new Types.ObjectId(tierListId), version })
      .exec();
  }

  async deleteForTierList(tierListId: string): Promise<void> {
    await this.revisionModel
      .deleteMany({ tierList: new Types.ObjectId(tierListId) })
      .exec();
  }
}
