import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueRepository } from "@modules/league/league.repository";
import { LeagueDocument } from "@modules/league/league.schema";
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

  async findBySlug(
    leagueSlug: string,
    tournamentSlug: string,
  ): Promise<HostedTournament> {
    const league = await this.leagueRepo.findBySlug(leagueSlug);

    const doc = await this.hostedTournamentModel
      .findOne({ slug: tournamentSlug, league: league._id })
      .exec();
    if (!doc)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug });
    const stages = await this.resolveStages(doc.stages);
    return HostedTournamentMapper.fromDatabase(doc, league, stages);
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
    return HostedTournamentMapper.fromDatabase(doc, league, stages);
  }

  async findAllByLeague(league: LeagueDocument): Promise<HostedTournament[]> {
    const docs = await this.hostedTournamentModel
      .find({ league: league._id })
      .exec();
    return Promise.all(
      docs.map(async (doc) => {
        const stages = await this.resolveStages(doc.stages);
        return HostedTournamentMapper.fromDatabase(doc, league, stages);
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
    const leaguesById = new Map(
      await Promise.all(
        leagueIds.map(async (leagueId) => {
          const league = await this.leagueRepo.findById(leagueId);
          return [leagueId, league] as const;
        }),
      ),
    );

    return Promise.all(
      docs.map(async (doc) => {
        const stages = await this.resolveStages(doc.stages);
        return HostedTournamentMapper.fromDatabase(
          doc,
          leaguesById.get(doc.league.toString())!,
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

  async updateRules(tournamentSlug: string, rules: TournamentRule[]) {
    const result = await this.hostedTournamentModel
      .findOneAndUpdate(
        { slug: tournamentSlug },
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
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug });
  }

  async updateSettings(
    tournamentId: Types.ObjectId | string,
    update: Partial<{
      tierList: Types.ObjectId;
      format: string;
      ruleset: string;
      draftCount: { min: number; max: number };
      pointTotal: number | null;
      tierRequirements: { tierName: string; required: number }[];
    }>,
  ): Promise<void> {
    // `null` means "clear this field" (e.g. remove a point cap entirely,
    // distinct from `undefined` which just leaves the stored value alone).
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, ""> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value === null) unsetFields[key] = "";
      else if (value !== undefined) setFields[key] = value;
    }

    const mongoUpdate: Record<string, unknown> = {};
    if (Object.keys(setFields).length) mongoUpdate["$set"] = setFields;
    if (Object.keys(unsetFields).length) mongoUpdate["$unset"] = unsetFields;

    const result = await this.hostedTournamentModel
      .findByIdAndUpdate(tournamentId, mongoUpdate)
      .exec();
    if (!result)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        tournamentId: tournamentId.toString(),
      });
  }
}
