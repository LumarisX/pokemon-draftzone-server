import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { StageDocument, StageEntity, StageType } from "./stage.schema";

@Injectable()
export class StageRepository {
  constructor(
    @InjectModel(StageEntity.name)
    private readonly stageModel: Model<StageDocument>,
  ) {}

  private normalizeObjectId(
    id: Types.ObjectId | string,
    fieldName: string,
  ): Types.ObjectId {
    if (id instanceof Types.ObjectId) return id;
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        [fieldName]: id,
      });
    }
    return new Types.ObjectId(id);
  }

  private normalizeObjectIdArray(
    ids: (Types.ObjectId | string)[],
    fieldName: string,
  ): Types.ObjectId[] {
    return ids.map((id) => this.normalizeObjectId(id, fieldName));
  }

  async findById(stageId: Types.ObjectId | string): Promise<StageDocument> {
    const normalizedStageId = this.normalizeObjectId(stageId, "stageId");

    const stage = await this.stageModel
      .findOne({ _id: { $eq: normalizedStageId } })
      .exec();
    if (!stage) throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
    return stage;
  }

  async findBySlug(
    tournamentId: Types.ObjectId | string,
    slug: string,
  ): Promise<StageDocument> {
    const stage = await this.stageModel
      .findOne({ slug: { $eq: slug }, tournamentId })
      .exec();
    if (!stage)
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug: slug });
    return stage;
  }

  async findByIdOrNull(
    stageId: Types.ObjectId | string,
  ): Promise<StageDocument | null> {
    const normalizedStageId = this.normalizeObjectId(stageId, "stageId");
    return this.stageModel.findOne({ _id: { $eq: normalizedStageId } }).exec();
  }

  async findManyByIds(
    stageIds: (Types.ObjectId | string)[],
  ): Promise<StageDocument[]> {
    const normalizedStageIds = this.normalizeObjectIdArray(
      stageIds,
      "stageIds",
    );
    return this.stageModel.find({ _id: { $in: normalizedStageIds } }).exec();
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<StageDocument[]> {
    const normalizedTournamentId = this.normalizeObjectId(
      tournamentId,
      "tournamentId",
    );
    return this.stageModel
      .find({ tournamentId: { $eq: normalizedTournamentId } })
      .sort({ order: 1 })
      .exec();
  }

  async applyStageDiff(options: {
    creates: {
      _id: Types.ObjectId;
      tournamentId: Types.ObjectId;
      order: number;
      name: string;
      type: StageType;
      public: boolean;
      teamIds: Types.ObjectId[];
      seedingLog: unknown[];
    }[];
    updates: { _id: Types.ObjectId; set: Record<string, unknown> }[];
    deletes: Types.ObjectId[];
  }): Promise<void> {
    const ops = [
      ...options.creates.map((doc) => ({
        insertOne: { document: { ...doc, slug: generateSlug() } },
      })),
      ...options.updates.map(({ _id, set }) => ({
        updateOne: { filter: { _id }, update: { $set: set } },
      })),
      ...(options.deletes.length
        ? [{ deleteMany: { filter: { _id: { $in: options.deletes } } } }]
        : []),
    ];
    if (ops.length === 0) return;
    await this.stageModel.bulkWrite(ops as never);
  }

  teamIdsInSeedOrder(stage: StageDocument): Types.ObjectId[] {
    return stage.teamIds ?? [];
  }
}
