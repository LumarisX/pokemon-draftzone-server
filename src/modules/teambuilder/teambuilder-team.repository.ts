import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  TeambuilderTeamDocument,
  TeambuilderTeamEntity,
  TeamContextType,
} from "./teambuilder-team.schema";

@Injectable()
export class TeambuilderTeamRepository {
  constructor(
    @InjectModel(TeambuilderTeamEntity.name)
    private readonly teamModel: Model<TeambuilderTeamDocument>,
  ) {}

  async findByContext(
    userSub: string,
    type: TeamContextType,
    id: string,
  ): Promise<TeambuilderTeamDocument[]> {
    return this.teamModel
      .find({ userSub, "context.type": type, "context.id": id })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findBySlug(
    userSub: string,
    slug: string,
  ): Promise<TeambuilderTeamDocument | null> {
    return this.teamModel.findOne({ userSub, slug }).exec();
  }

  async create(
    userSub: string,
    data: Omit<TeambuilderTeamEntity, "slug" | "userSub">,
  ): Promise<TeambuilderTeamDocument> {
    return this.teamModel.create({ ...data, userSub });
  }

  async upsertBySlug(
    userSub: string,
    slug: string,
    data: Omit<TeambuilderTeamEntity, "slug" | "userSub">,
  ): Promise<TeambuilderTeamDocument> {
    return this.teamModel
      .findOneAndUpdate(
        { userSub, slug },
        { $set: { ...data, userSub, slug } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async deleteBySlug(userSub: string, slug: string): Promise<boolean> {
    const result = await this.teamModel.deleteOne({ userSub, slug }).exec();
    return result.deletedCount > 0;
  }
}
