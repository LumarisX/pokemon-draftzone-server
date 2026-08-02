import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { stageTeamIds } from "./domain/stage-axis";
import { StageDocument, StageEntity, StageType } from "./stage.schema";

export type CreateStageInput = {
  tournamentId: Types.ObjectId | string;
  order: number;
  name: string;
  type: StageType;
  public?: boolean;
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
        // Either field may hold the roster: `teamIds` on a migrated stage,
        // `pools` on one that predates the split.
        $or: [
          { teamIds: { $eq: normalizedTeamId } },
          { "pools.teamIds": { $eq: normalizedTeamId } },
        ],
      })
      .exec();
  }

  async create(data: CreateStageInput): Promise<StageDocument> {
    const stage = new this.stageModel({
      tournamentId: data.tournamentId,
      order: data.order,
      name: data.name,
      type: data.type,
      // Omitted rather than defaulted to undefined, so the schema default wins.
      ...(data.public === undefined ? {} : { public: data.public }),
      rounds: data.rounds ?? [],
      pools: data.pools ?? [],
      trades: [],
      currentRoundIndex: -1,
    });
    await stage.save();
    return stage;
  }

  /**
   * Applies a whole tournament's stage edit in one round-trip: inserts stages
   * the payload introduced, updates the ones it kept, and removes the rest.
   *
   * Ids are supplied by the caller because matchups reference stages, and the
   * bracket path pre-allocates them so a match created in the same request can
   * name the stage it belongs to.
   */
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
      ...options.creates.map((doc) => ({ insertOne: { document: doc } })),
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

  async setPublic(
    stageId: Types.ObjectId | string,
    isPublic: boolean,
  ): Promise<StageDocument> {
    const normalizedStageId = this.normalizeObjectId(stageId, "stageId");
    const stage = await this.stageModel.findOneAndUpdate(
      { _id: { $eq: normalizedStageId } },
      { $set: { public: isPublic } },
      { returnDocument: "after" },
    );
    if (!stage) throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
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
      { returnDocument: "after" },
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
      { returnDocument: "after" },
    );
    if (!stage) throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
    return stage;
  }

  /**
   * The stage's teams in seed order, empty when it has none yet.
   *
   * Reads `teamIds` first and falls back to flattening `pools`, because a stage
   * created by the sections-to-stages migration has only the former and a stage
   * predating it has only the latter.
   *
   * Deliberately total. A stage whose bracket has not been built yet has no
   * teams, which is a normal state — the reads that hang off this (a team page,
   * a standings table) show an empty competition rather than failing.
   */
  teamIdsInSeedOrder(stage: StageDocument): Types.ObjectId[] {
    return stageTeamIds(stage);
  }
}
