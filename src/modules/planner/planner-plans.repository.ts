import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model } from "mongoose";
import { StoredPlan } from "./planner-plans.domain";
import {
  PlannerPlansDocument,
  PlannerPlansEntity,
} from "./planner-plans.schema";

@Injectable()
export class PlannerPlansRepository {
  constructor(
    @InjectModel(PlannerPlansEntity.name)
    private readonly plansModel: Model<PlannerPlansDocument>,
  ) {}

  async find(owner: string, key: string): Promise<PlannerPlansDocument | null> {
    return this.plansModel
      .findOne({ owner: { $eq: owner }, key: { $eq: key } })
      .exec();
  }

  async findAllByOwner(owner: string): Promise<PlannerPlansDocument[]> {
    return this.plansModel
      .find({ owner: { $eq: owner } })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async countByOwner(owner: string): Promise<number> {
    return this.plansModel.countDocuments({ owner: { $eq: owner } }).exec();
  }

  async insert(
    owner: string,
    key: string,
    plans: StoredPlan[],
  ): Promise<number | null> {
    try {
      const doc = await this.plansModel.create({
        owner,
        key,
        plans,
        revision: 1,
      });
      return doc.revision;
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      )
        return null;
      throw error;
    }
  }

  async replace(
    owner: string,
    key: string,
    revision: number,
    plans: StoredPlan[],
  ): Promise<number | null> {
    const doc = await this.plansModel
      .findOneAndUpdate(
        { owner: { $eq: owner }, key: { $eq: key }, revision: { $eq: revision } },
        { $set: { plans }, $inc: { revision: 1 } },
        { returnDocument: "after" },
      )
      .exec();
    return doc?.revision ?? null;
  }
}
