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

  async findManyByIds(
    leagueIds: (Types.ObjectId | string)[],
  ): Promise<LeagueDocument[]> {
    if (leagueIds.length === 0) return [];
    return this.leagueModel.find({ _id: { $in: leagueIds } }).exec();
  }

  async create(league: {
    name: string;
    description?: string;
    owner: string;
  }): Promise<LeagueDocument> {
    return this.leagueModel.create(league);
  }

  async update(
    leagueId: Types.ObjectId,
    changes: { name?: string; description?: string | null; logo?: string | null },
  ): Promise<void> {
    const set: Record<string, string> = {};
    const unset: Record<string, ""> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === null) unset[key] = "";
      else set[key] = value;
    }
    await this.leagueModel
      .updateOne(
        { _id: leagueId },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      )
      .exec();
  }

  async findByOwner(owner: string): Promise<LeagueDocument[]> {
    return this.leagueModel
      .find({ owner: { $eq: owner } })
      .sort({ createdAt: -1 })
      .exec();
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
