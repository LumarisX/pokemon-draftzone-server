import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  LeagueMatchupDocument,
  LeagueMatchupEntity,
} from "./league-matchup.schema";

const TEAM_POPULATE = [
  { path: "side1.team", populate: { path: "coach" } },
  { path: "side2.team", populate: { path: "coach" } },
];

@Injectable()
export class LeagueMatchupRepository {
  constructor(
    @InjectModel(LeagueMatchupEntity.name)
    private readonly matchupModel: Model<LeagueMatchupDocument>,
  ) {}

  async findByRounds(roundIds: (Types.ObjectId | string)[]) {
    return this.matchupModel
      .find({ round: { $in: roundIds } })
      .sort({ _id: 1 })
      .lean();
  }

  async findByStage(
    stageId: Types.ObjectId | string,
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: stageId,
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      .populate(TEAM_POPULATE)
      .exec();
  }

  async findByRoundsInStage(
    stageId: Types.ObjectId | string,
    roundIds: (Types.ObjectId | string)[],
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: stageId,
        round: { $in: roundIds },
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      .populate(TEAM_POPULATE)
      .exec();
  }

  async countByStage(stageId: Types.ObjectId | string): Promise<number> {
    return this.matchupModel.countDocuments({ stage: stageId }).exec();
  }

  /**
   * Bulk-insert pre-built matchup documents (bracket generation). Callers
   * are expected to have already assigned `_id`s so slot.matchId references
   * between the inserted matchups resolve.
   */
  async createMany(
    matchups: (Partial<LeagueMatchupEntity> & { _id: Types.ObjectId })[],
  ): Promise<LeagueMatchupDocument[]> {
    const inserted = await this.matchupModel.insertMany(matchups);
    return inserted as unknown as LeagueMatchupDocument[];
  }

  async deleteByStage(stageId: Types.ObjectId | string): Promise<number> {
    const result = await this.matchupModel
      .deleteMany({ stage: stageId })
      .exec();
    return result.deletedCount;
  }

  async findByIdInStage(
    matchupId: Types.ObjectId | string,
    stageId: Types.ObjectId | string,
  ) {
    const matchup = await this.matchupModel
      .findOne({ _id: matchupId, stage: stageId })
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupId });
    return matchup;
  }

  async findByIdInStagePopulated(
    matchupId: Types.ObjectId | string,
    stageId: Types.ObjectId | string,
  ) {
    const matchup = await this.matchupModel
      .findOne({ _id: matchupId, stage: stageId })
      .populate(TEAM_POPULATE)
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupId });
    return matchup;
  }

  async resolveDownstreamSlots(
    stageId: Types.ObjectId | string,
    sourceMatchupId: Types.ObjectId | string,
    winnerTeamId?: Types.ObjectId,
    loserTeamId?: Types.ObjectId,
  ): Promise<void> {
    const sourceMatchIdStr = sourceMatchupId.toString();
    const updates: Promise<unknown>[] = [];

    for (const side of ["side1", "side2"] as const) {
      if (winnerTeamId) {
        updates.push(
          this.matchupModel
            .updateMany(
              {
                stage: stageId,
                [`${side}.slot.type`]: "winner",
                [`${side}.slot.matchId`]: sourceMatchIdStr,
              },
              { $set: { [`${side}.team`]: winnerTeamId } },
            )
            .exec(),
        );
      }
      if (loserTeamId) {
        updates.push(
          this.matchupModel
            .updateMany(
              {
                stage: stageId,
                [`${side}.slot.type`]: "loser",
                [`${side}.slot.matchId`]: sourceMatchIdStr,
              },
              { $set: { [`${side}.team`]: loserTeamId } },
            )
            .exec(),
        );
      }
    }

    await Promise.all(updates);
  }
}
