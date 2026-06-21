import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { LeagueDocument, LeagueEntity } from "./league.schema";

@Injectable()
export class LeagueRepository {
  constructor(
    @InjectModel(LeagueEntity.name)
    private readonly leagueModel: Model<LeagueDocument>,
  ) {}

  async findByKey(leagueKey: string): Promise<LeagueDocument> {
    const league = await this.leagueModel.findOne({ leagueKey }).exec();
    if (!league) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey });
    return league;
  }
}
