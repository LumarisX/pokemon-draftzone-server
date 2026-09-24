import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  TournamentApplicationDocument,
  TournamentApplicationEntity,
  TournamentApplicationIntent,
  TournamentApplicationStatus,
} from "./tournament-application.schema";

export type CreateTournamentApplicationInput = {
  tournamentId: Types.ObjectId | string;
  auth0Id: string;
  name: string;
  gameName: string;
  discordName: string;
  timezone: string;
  experience: string;
  droppedBefore: boolean;
  droppedWhy?: string;
  confirmed: boolean;
  preferredTeamName: string;
  preferredLogo?: string;
  intent?: TournamentApplicationIntent;
  status?: TournamentApplicationStatus;
  answers?: { questionId: string; values: string[] }[];
  joinTeamId?: Types.ObjectId | string;
  submittedAt?: Date;
};

export type DecideTournamentApplicationInput = {
  status: TournamentApplicationStatus;
  decidedBy?: string;
  resultingTeamId?: Types.ObjectId | string;
  resultingCoachId?: Types.ObjectId | string;
};

const DECIDED: TournamentApplicationStatus[] = ["approved", "denied"];

@Injectable()
export class TournamentApplicationRepository {
  constructor(
    @InjectModel(TournamentApplicationEntity.name)
    private readonly applicationModel: Model<TournamentApplicationDocument>,
  ) {}

  private toObjectId(id: Types.ObjectId | string): Types.ObjectId {
    if (id instanceof Types.ObjectId) return id;
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        applicationId: String(id),
      });
    }
    return new Types.ObjectId(id);
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<TournamentApplicationDocument> {
    const application = await this.applicationModel
      .findById(this.toObjectId(id))
      .exec();
    if (!application) {
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, {
        applicationId: String(id),
      });
    }
    return application;
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<TournamentApplicationDocument[]> {
    return this.applicationModel
      .find({ tournamentId })
      .sort({ submittedAt: 1 })
      .exec();
  }

  async findForApplicant(
    tournamentId: Types.ObjectId | string,
    auth0Id: string,
  ): Promise<TournamentApplicationDocument[]> {
    return this.applicationModel
      .find({ tournamentId, auth0Id: { $eq: auth0Id } })
      .exec();
  }

  async findBlockingApplication(
    tournamentId: Types.ObjectId | string,
    auth0Id: string,
  ): Promise<TournamentApplicationDocument | null> {
    const existing = await this.findForApplicant(tournamentId, auth0Id);
    return existing[0] ?? null;
  }

  async countByStatuses(
    tournamentId: Types.ObjectId | string,
    statuses: readonly TournamentApplicationStatus[],
  ): Promise<number> {
    return this.applicationModel
      .countDocuments({ tournamentId, status: { $in: statuses } })
      .exec();
  }

  async create(
    data: CreateTournamentApplicationInput,
  ): Promise<TournamentApplicationDocument> {
    const application = new this.applicationModel({
      tournamentId: data.tournamentId,
      auth0Id: data.auth0Id,
      name: data.name,
      gameName: data.gameName,
      discordName: data.discordName,
      timezone: data.timezone,
      experience: data.experience,
      droppedBefore: data.droppedBefore,
      droppedWhy: data.droppedWhy,
      confirmed: data.confirmed,
      preferredTeamName: data.preferredTeamName,
      preferredLogo: data.preferredLogo,
      intent: data.intent ?? "team",
      status: data.status ?? "pending",
      answers: data.answers ?? [],
      joinTeamId: data.joinTeamId,
      submittedAt: data.submittedAt ?? new Date(),
    });
    try {
      await application.save();
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
          tournamentId: String(data.tournamentId),
        });
      throw error;
    }
    return application;
  }

  async decide(
    id: Types.ObjectId | string,
    data: DecideTournamentApplicationInput,
  ): Promise<TournamentApplicationDocument> {
    const application = await this.findById(id);

    application.status = data.status;
    if (data.decidedBy !== undefined) application.decidedBy = data.decidedBy;
    if (data.resultingTeamId !== undefined) {
      application.resultingTeamId = this.toObjectId(data.resultingTeamId);
    }
    if (data.resultingCoachId !== undefined) {
      application.resultingCoachId = this.toObjectId(data.resultingCoachId);
    }
    application.decidedAt = DECIDED.includes(data.status)
      ? new Date()
      : undefined;

    await application.save();
    return application;
  }

  async denyAllForTeam(
    teamId: Types.ObjectId | string,
    decidedBy: string,
  ): Promise<number> {
    const result = await this.applicationModel
      .updateMany(
        { resultingTeamId: this.toObjectId(teamId) },
        {
          $set: { status: "denied", decidedBy, decidedAt: new Date() },
          $unset: { resultingTeamId: "", resultingCoachId: "" },
        },
      )
      .exec();
    return result.modifiedCount;
  }

  async delete(id: Types.ObjectId | string): Promise<void> {
    await this.applicationModel.deleteOne({ _id: this.toObjectId(id) }).exec();
  }
}
