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

  async findByDivision(
    divisionId: Types.ObjectId | string,
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        division: divisionId,
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

  async findByRoundsInDivision(
    divisionId: Types.ObjectId | string,
    roundIds: (Types.ObjectId | string)[],
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        division: divisionId,
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

  async findByIdInDivision(
    matchupId: Types.ObjectId | string,
    divisionId: Types.ObjectId | string,
  ) {
    const matchup = await this.matchupModel
      .findOne({ _id: matchupId, division: divisionId })
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupId });
    return matchup;
  }
}
