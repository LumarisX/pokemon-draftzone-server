import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  ExternalTournamentAdDocument,
  ExternalTournamentAdEntity,
} from "./external-tournament-ad.schema";
import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";
@Injectable()
export class ExternalTournamentAdRepository {
  constructor(
    @InjectModel(ExternalTournamentAdEntity.name)
    private readonly externalTournamentAdModel: Model<ExternalTournamentAdDocument>,
  ) {}

  async getOpenTournamentAds(): Promise<ExternalTournamentAd[]> {
    const documents = await this.externalTournamentAdModel
      .find({
        closesAt: { $gte: new Date() },
        status: "Approved",
      })
      .sort({ createdAt: -1 })
      .exec();
    return documents.map(ExternalTournamentAdMapper.fromDatabase);
  }

  async getMyTournamentAds(owner: string): Promise<ExternalTournamentAd[]> {
    const documents = await this.externalTournamentAdModel
      .find({ owner })
      .sort({
        createdAt: -1,
      })
      .exec();
    return documents.map(ExternalTournamentAdMapper.fromDatabase);
  }

  async createTournamentAd(
    tournamentAd: ExternalTournamentAd,
  ): Promise<ExternalTournamentAd> {
    const document = await this.externalTournamentAdModel.create(
      ExternalTournamentAdMapper.toDatabasePayload(tournamentAd),
    );
    return ExternalTournamentAdMapper.fromDatabase(document);
  }

  async updateStatus(
    adId: string,
    status: "Approved" | "Denied",
  ): Promise<ExternalTournamentAd | null> {
    const document = await this.externalTournamentAdModel
      .findByIdAndUpdate(adId, { status }, { new: true })
      .exec();
    return document ? ExternalTournamentAdMapper.fromDatabase(document) : null;
  }

  async deleteTournamentAd(adId: string, owner: string): Promise<number> {
    const result = await this.externalTournamentAdModel
      .deleteOne({ _id: adId, owner })
      .exec();
    return result.deletedCount;
  }
}
