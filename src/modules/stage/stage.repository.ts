import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  StageDocument,
  StageEntity,
  StagePoolEntity,
  StageType,
} from "./stage.schema";

export type CreateStageInput = {
  tournamentId: Types.ObjectId | string;
  order: number;
  name: string;
  type: StageType;
  rounds?: {
    name: string;
    matchDeadline?: Date;
    tradeDeadline?: Date;
    bestOf?: number;
  }[];
  pools?: {
    poolKey: string;
    name: string;
    teamIds: (Types.ObjectId | string)[];
  }[];
};

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

  /** What stage/pool is this team currently grouped under, if any. */
  async findByTeamId(
    tournamentId: Types.ObjectId | string,
    teamId: Types.ObjectId | string,
  ): Promise<StageDocument | null> {
    const normalizedTournamentId = this.normalizeObjectId(
      tournamentId,
      "tournamentId",
    );
    const normalizedTeamId = this.normalizeObjectId(teamId, "teamId");
    return this.stageModel
      .findOne({
        tournamentId: { $eq: normalizedTournamentId },
        "pools.teamIds": { $eq: normalizedTeamId },
      })
      .exec();
  }

  async create(data: CreateStageInput): Promise<StageDocument> {
    const stage = new this.stageModel({
      tournamentId: data.tournamentId,
      order: data.order,
      name: data.name,
      type: data.type,
      rounds: data.rounds ?? [],
      pools: data.pools ?? [],
      trades: [],
      currentRoundIndex: -1,
    });
    await stage.save();
    return stage;
  }

  async setPools(
    stageId: Types.ObjectId | string,
    pools: {
      poolKey: string;
      name: string;
      teamIds: (Types.ObjectId | string)[];
    }[],
  ): Promise<StageDocument> {
    const normalizedStageId = this.normalizeObjectId(stageId, "stageId");
    const stage = await this.stageModel.findOneAndUpdate(
      { _id: { $eq: normalizedStageId } },
      { $set: { pools } },
      { new: true },
    );
    if (!stage) throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
    return stage;
  }

  async setCurrentRoundIndex(
    stageId: Types.ObjectId | string,
    currentRoundIndex: number,
  ): Promise<StageDocument> {
    const normalizedStageId = this.normalizeObjectId(stageId, "stageId");
    const stage = await this.stageModel.findOneAndUpdate(
      { _id: { $eq: normalizedStageId } },
      { $set: { currentRoundIndex } },
      { new: true },
    );
    if (!stage) throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
    return stage;
  }

  /** Flattens every pool's teamIds — throws if the stage has no pools yet. */
  flattenPoolTeamIds(stage: StageDocument): Types.ObjectId[] {
    if (!stage.pools.length)
      throw new PDZError(ErrorCodes.STAGE.NO_POOLS_DEFINED, {
        stageId: stage._id.toString(),
      });
    return stage.pools.flatMap((pool: StagePoolEntity) => pool.teamIds);
  }
}
