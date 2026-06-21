import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import LeagueModel from "../../../../models/league/league.model";
import { TournamentRule } from "./hosted-tournament.domain";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "./hosted-tournament.schema";

@Injectable()
export class HostedTournamentRepository {
  constructor(
    @InjectModel(HostedTournamentEntity.name)
    private readonly hostedTournamentModel: Model<HostedTournamentDocument>,
  ) {}

  async findByKey(leagueKey: string, tournamentKey: string) {
    const league = await LeagueModel.findOne({ leagueKey }).exec();
    if (!league) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey });

    const doc = await this.hostedTournamentModel
      .findOne({ tournamentKey, league: league._id })
      .exec();
    if (!doc) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
    return HostedTournamentMapper.fromDatabase(doc, league.owner);
  }

  async findAllByLeague(leagueId: string, ownerAuth0Id: string) {
    const docs = await this.hostedTournamentModel
      .find({ league: leagueId })
      .exec();
    return docs.map((doc) =>
      HostedTournamentMapper.fromDatabase(doc, ownerAuth0Id),
    );
  }

  async updateRules(tournamentKey: string, rules: TournamentRule[]) {
    const result = await this.hostedTournamentModel
      .findOneAndUpdate(
        { tournamentKey },
        {
          $set: {
            rules: rules.map((rule) => ({
              title: rule.title,
              body: rule.body,
            })),
          },
        },
      )
      .exec();
    if (!result) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
  }
}
