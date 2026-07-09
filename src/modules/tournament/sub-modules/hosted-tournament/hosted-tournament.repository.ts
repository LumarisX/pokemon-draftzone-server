import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueRepository } from "@modules/league/league.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
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
    private readonly leagueRepo: LeagueRepository,
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  async findByKey(
    leagueKey: string,
    tournamentKey: string,
  ): Promise<HostedTournament> {
    const league = await this.leagueRepo.findByKey(leagueKey);

    const doc = await this.hostedTournamentModel
      .findOne({ tournamentKey, league: league._id })
      .exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
    const stages = await this.resolveStages(doc.stages);
    return HostedTournamentMapper.fromDatabase(doc, league.owner, stages);
  }

  async findById(
    tournamentId: Types.ObjectId | string,
  ): Promise<HostedTournament> {
    const doc = await this.hostedTournamentModel.findById(tournamentId).exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentId: tournamentId.toString(),
      });
    const league = await this.leagueRepo.findById(doc.league);
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

  async findByParticipant(sub: string): Promise<HostedTournament[]> {
    const coaches = await this.coachRepo.findByAuth0Id(sub);
    if (coaches.length === 0) return [];

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const tournamentIds = [
      ...new Set(teams.map((team) => team.tournamentId.toString())),
    ];
    if (tournamentIds.length === 0) return [];

    const docs = await this.hostedTournamentModel
      .find({ _id: { $in: tournamentIds }, archived: { $ne: true } })
      .sort({ createdAt: -1 })
      .exec();

    const leagueIds = [...new Set(docs.map((doc) => doc.league.toString()))];
    const ownersByLeague = new Map(
      await Promise.all(
        leagueIds.map(async (leagueId) => {
          const league = await this.leagueRepo.findById(leagueId);
          return [leagueId, league.owner] as const;
        }),
      ),
    );

    return Promise.all(
      docs.map(async (doc) => {
        const stages = await this.resolveStages(doc.stages);
        return HostedTournamentMapper.fromDatabase(
          doc,
          ownersByLeague.get(doc.league.toString())!,
          stages,
        );
      }),
    );
  }

  private async resolveStages(stageIds: Types.ObjectId[]) {
    const stages = await Promise.all(
      stageIds.map((id) => this.stageRepo.findByIdOrNull(id)),
    );
    return stages.filter(
      (stage): stage is NonNullable<typeof stage> => stage !== null,
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
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
  }

  async updateSettings(
    tournamentId: Types.ObjectId | string,
    update: Partial<{
      tierList: Types.ObjectId;
      format: string;
      ruleset: string;
      draftCount: { min: number; max: number };
      pointTotal: number;
      tierRequirements: { tierName: string; required: number }[];
    }>,
  ): Promise<void> {
    const result = await this.hostedTournamentModel
      .findByIdAndUpdate(tournamentId, { $set: update })
      .exec();
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentId: tournamentId.toString(),
      });
  }
}
