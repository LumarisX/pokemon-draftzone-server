import { LeagueDocument } from "@modules/league/league.schema";
import {
  TierListDocument,
  TierListEntity,
} from "@modules/tier-list/tier-list.schema";
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
    @InjectModel(TierListEntity.name)
    private readonly tierListModel: Model<TierListDocument>,
  ) {}

  async getHostedTournamentAds() {
    const docs = await this.hostedTournamentModel
      .find({
        "adSettings.advertise": true,
        archived: { $ne: true },
        signUpDeadline: { $gt: new Date() },
        tierList: { $ne: null },
      })
      .sort({ createdAt: -1 })
      .populate<{ league: LeagueDocument }>("league")
      .exec();

    const tierListIds = [
      ...new Set(
        docs.flatMap((doc) => (doc.tierList ? [doc.tierList.toString()] : [])),
      ),
    ];
    const tierLists = await this.tierListModel
      .find({ _id: { $in: tierListIds } })
      .select("format ruleset")
      .lean()
      .exec();
    const metaById = new Map(
      tierLists.map((tierList) => [
        tierList._id.toString(),
        { format: tierList.format, ruleset: tierList.ruleset },
      ]),
    );

    return docs.flatMap((doc) => {
      if (!doc.league || !doc.tierList) return [];
      const meta = metaById.get(doc.tierList.toString());
      if (!meta) return [];
      return [HostedTournamentAdMapper.toClientPayload(doc, doc.league, meta)];
    });
  }
}
