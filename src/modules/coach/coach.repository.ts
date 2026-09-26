import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { CoachDocument, CoachEntity } from "./coach.schema";

export type CreateCoachInput = {
  _id?: Types.ObjectId;
  auth0Id: string;
  name: string;
  gameName: string;
  discordName: string;
  timezone: string;
  teamId: Types.ObjectId | string;
  experience: string;
  droppedBefore: boolean;
  droppedWhy?: string;
  confirmed: boolean;
};

export type UpdateCoachInput = Partial<{
  name: string;
  gameName: string;
  discordName: string;
  timezone: string;
  experience: string;
  droppedBefore: boolean;
  droppedWhy: string;
  role: string;
  leftAt: Date | null;
}>;

@Injectable()
export class CoachRepository {
  constructor(
    @InjectModel(CoachEntity.name)
    private readonly coachModel: Model<CoachDocument>,
  ) {}

  private toObjectId(coachId: Types.ObjectId | string): Types.ObjectId {
    if (coachId instanceof Types.ObjectId) return coachId;
    if (typeof coachId !== "string" || !Types.ObjectId.isValid(coachId)) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        field: "coachId",
        value: coachId,
      });
    }
    return new Types.ObjectId(coachId);
  }

  async findById(coachId: Types.ObjectId | string): Promise<CoachDocument> {
    const safeCoachId = this.toObjectId(coachId);
    const coach = await this.coachModel.findById(safeCoachId).exec();
    if (!coach)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });
    return coach;
  }

  async findByIdOrNull(
    coachId: Types.ObjectId | string,
  ): Promise<CoachDocument | null> {
    if (!(coachId instanceof Types.ObjectId) && !Types.ObjectId.isValid(coachId))
      return null;
    return this.coachModel.findById(coachId).exec();
  }

  async findAllByTeam(
    teamId: Types.ObjectId | string,
  ): Promise<CoachDocument[]> {
    return this.coachModel.find({ teamId }).sort({ signedUpAt: 1 }).exec();
  }

  async findByAuth0Id(auth0Id: string): Promise<CoachDocument[]> {
    return this.coachModel.find({ auth0Id }).exec();
  }

  async create(data: CreateCoachInput): Promise<CoachDocument> {
    const coach = new this.coachModel({
      ...data,
      signedUpAt: new Date(),
    });
    await coach.save();
    return coach;
  }

  async update(
    coachId: Types.ObjectId | string,
    data: UpdateCoachInput,
  ): Promise<CoachDocument> {
    const safeCoachId = this.toObjectId(coachId);
    const coach = await this.coachModel.findByIdAndUpdate(
      safeCoachId,
      { $set: data },
      { returnDocument: "after" },
    );
    if (!coach)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });
    return coach;
  }

  async delete(coachId: Types.ObjectId | string): Promise<void> {
    const safeCoachId = this.toObjectId(coachId);
    const result = await this.coachModel.findByIdAndDelete(safeCoachId);
    if (!result)
      throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, { coachId });
  }

  async deleteAllByTeam(teamId: Types.ObjectId | string): Promise<number> {
    const result = await this.coachModel
      .deleteMany({ teamId: this.toObjectId(teamId) })
      .exec();
    return result.deletedCount;
  }
}
