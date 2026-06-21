import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { StageRepository } from "@modules/stage/stage.repository";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import LeagueModel from "../../../../models/league/league.model";
import { HostedTournament, TournamentRule } from "./hosted-tournament.domain";
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
    private readonly stageRepo: StageRepository,
  ) {}

  async findByKey(
    leagueKey: string,
    tournamentKey: string,
  ): Promise<HostedTournament> {
    const league = await LeagueModel.findOne({ leagueKey }).exec();
    if (!league) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey });

    const doc = await this.hostedTournamentModel
      .findOne({ tournamentKey, league: league._id })
      .exec();
    if (!doc) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
    const stages = await this.resolveStages(doc.stages);
    return HostedTournamentMapper.fromDatabase(doc, league.owner, stages);
  }

  async findAllByLeague(
    leagueId: string,
    ownerAuth0Id: string,
  ): Promise<HostedTournament[]> {
    const docs = await this.hostedTournamentModel
      .find({ league: leagueId })
      .exec();
    return Promise.all(
      docs.map(async (doc) => {
        const stages = await this.resolveStages(doc.stages);
        return HostedTournamentMapper.fromDatabase(doc, ownerAuth0Id, stages);
      }),
    );
  }

  /** Resolves a tournament's stage ObjectIds in-order (array order is the tournament's stage sequence). */
  private async resolveStages(stageIds: Types.ObjectId[]) {
    const stages = await Promise.all(
      stageIds.map((id) => this.stageRepo.findByIdOrNull(id)),
    );
    return stages.filter((stage): stage is NonNullable<typeof stage> => stage !== null);
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
