import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ClientSession, Model, Types } from "mongoose";
import { ErrorCodes } from "../../../../errors/error-codes";
import { PDZError } from "../../../../errors/pdz-error";
import {
  ExternalTournamentDocument,
  ExternalTournamentEntity,
} from "./external-tournament.schema";

@Injectable()
export class ExternalTournamentRepository {
  constructor(
    @InjectModel(ExternalTournamentEntity.name)
    private readonly tournamentModel: Model<ExternalTournamentDocument>,
  ) {}

  async findByOwner(ownerId: string): Promise<ExternalTournamentDocument[]> {
    return this.tournamentModel
      .find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByTournamentAndOwner(
    tournamentId: string,
    ownerId: string,
  ): Promise<ExternalTournamentDocument> {
    const tournament = await this.tournamentModel
      .findOne({ owner: ownerId, leagueId: tournamentId })
      .exec();
    if (!tournament) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    return tournament;
  }

  async findById(
    id: string | Types.ObjectId,
  ): Promise<ExternalTournamentDocument | null> {
    return this.tournamentModel.findById(id).exec();
  }

  async create(draftData: any): Promise<ExternalTournamentDocument> {
    const doc = new this.tournamentModel(draftData);
    return doc.save();
  }

  async updateByLeagueAndOwner(
    leagueId: string,
    ownerId: string,
    data: any,
  ): Promise<ExternalTournamentDocument | null> {
    return this.tournamentModel
      .findOneAndUpdate({ owner: ownerId, leagueId }, data, {
        new: true,
        upsert: true,
      })
      .exec();
  }

  async deleteByLeagueAndOwner(
    leagueId: string,
    ownerId: string,
    session?: ClientSession,
  ): Promise<any> {
    return this.tournamentModel
      .deleteOne({ owner: ownerId, leagueId })
      .session(session || null)
      .exec();
  }
}
