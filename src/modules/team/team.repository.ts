import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachDocument } from "@modules/coach/coach.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { TeamDocument, TeamEntity } from "./team.schema";

export type PopulatedTeam = TeamDocument & { coach: CoachDocument };

export type CreateTeamInput = {
  // Settable so HostedTournamentService.createSignup can pre-generate the id
  // and create the Coach + Team pair without a temporary invalid state on
  // either side's required ref to the other.
  _id?: Types.ObjectId;
  tournamentId: Types.ObjectId | string;
  draftId?: Types.ObjectId | string;
  coach: Types.ObjectId | string;
  teamName: string;
  logo?: string;
  status?: "approved" | "pending" | "denied";
};

@Injectable()
export class TeamRepository {
  constructor(
    @InjectModel(TeamEntity.name)
    private readonly teamModel: Model<TeamDocument>,
  ) {}

  async findById(teamId: Types.ObjectId | string): Promise<PopulatedTeam> {
    const team = await this.teamModel
      .findById(teamId)
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
    return team as unknown as PopulatedTeam;
  }

  async findManyByIds(
    teamIds: (Types.ObjectId | string)[],
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ _id: { $in: teamIds } })
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async findByIdOrNull(
    teamId: Types.ObjectId | string,
  ): Promise<PopulatedTeam | null> {
    const team = await this.teamModel
      .findById(teamId)
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    return team as unknown as PopulatedTeam | null;
  }

  async findByCoachId(
    coachId: Types.ObjectId | string,
  ): Promise<PopulatedTeam | null> {
    const team = await this.teamModel
      .findOne({ coach: coachId })
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    return team as unknown as PopulatedTeam | null;
  }

  async findAllByDraft(
    draftId: Types.ObjectId | string,
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ draftId })
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ tournamentId })
      .populate<{ coach: CoachDocument }>("coach")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async create(data: CreateTeamInput): Promise<PopulatedTeam> {
    const team = new this.teamModel({
      ...(data._id ? { _id: data._id } : {}),
      tournamentId: data.tournamentId,
      draftId: data.draftId,
      coach: data.coach,
      teamName: data.teamName,
      logo: data.logo,
      status: data.status ?? "pending",
      picks: [],
      pickLog: [],
    });
    await team.save();
    return this.findById(team._id);
  }

  async countByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<number> {
    return this.teamModel.countDocuments({ tournamentId }).exec();
  }

  async update(
    teamId: Types.ObjectId | string,
    data: {
      teamName?: string;
      logo?: string;
      status?: "approved" | "pending" | "denied";
      draftId?: Types.ObjectId | string | null;
    },
  ): Promise<PopulatedTeam> {
    const update: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    if (data.teamName !== undefined) update["teamName"] = data.teamName;
    if (data.logo !== undefined) update["logo"] = data.logo;
    if (data.status !== undefined) update["status"] = data.status;
    if (data.draftId !== undefined) {
      if (data.draftId === null) unset["draftId"] = "";
      else update["draftId"] = data.draftId;
    }

    const team = await this.teamModel.findByIdAndUpdate(teamId, {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    });
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
    return this.findById(teamId);
  }

  async delete(teamId: Types.ObjectId | string): Promise<void> {
    const result = await this.teamModel.findByIdAndDelete(teamId);
    if (!result) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
  }
}
