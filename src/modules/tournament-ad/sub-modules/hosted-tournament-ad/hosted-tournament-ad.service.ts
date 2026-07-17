import { LeagueDocument } from "@modules/league/league.schema";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HostedTournamentAdMapper } from "./hosted-tournament-ad.mapper";

@Injectable()
export class HostedTournamentAdService {
  constructor(
    @InjectModel(HostedTournamentEntity.name)
    private readonly hostedTournamentModel: Model<HostedTournamentDocument>,
  ) {}

  async getHostedTournamentAds() {
    const docs = await this.hostedTournamentModel
      .find({
        "adSettings.advertise": true,
        archived: { $ne: true },
        signUpDeadline: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .populate<{ league: LeagueDocument }>("league")
      .exec();

    return docs
      .filter((doc) => doc.league)
      .map((doc) => HostedTournamentAdMapper.toClientPayload(doc, doc.league));
  }
}
