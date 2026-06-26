import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { CoachDocument, CoachEntity } from "./coach.schema";

export type CreateCoachInput = {
  // Settable so HostedTournamentService.createSignup can pre-generate the id
  // and create the Coach + Team pair without a temporary invalid state on
  // either side's required ref to the other.
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
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });
    return coach;
  }

  /** A person can sign up for multiple tournaments, producing one Coach row per signup. */
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
      { new: true },
    );
    if (!coach)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });
    return coach;
  }

  async delete(coachId: Types.ObjectId | string): Promise<void> {
    const safeCoachId = this.toObjectId(coachId);
    const result = await this.coachModel.findByIdAndDelete(safeCoachId);
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });
  }
}
