import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { LeagueDocument, LeagueEntity } from "./league.schema";

@Injectable()
export class LeagueRepository {
  constructor(
    @InjectModel(LeagueEntity.name)
    private readonly leagueModel: Model<LeagueDocument>,
  ) {}

  async findBySlug(leagueSlug: string): Promise<LeagueDocument> {
    const league = await this.leagueModel.findOne({ slug: leagueSlug }).exec();
    if (!league) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueSlug });
    return league;
  }

  async findById(leagueId: Types.ObjectId | string): Promise<LeagueDocument> {
    const league = await this.leagueModel.findById(leagueId).exec();
    if (!league)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        leagueId: leagueId.toString(),
      });
    return league;
  }
}
