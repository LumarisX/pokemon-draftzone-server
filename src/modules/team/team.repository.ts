import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachDocument } from "@modules/coach/coach.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ClientSession, Model, Types } from "mongoose";
import { TeamDocument, TeamEntity, TeamStatus } from "./team.schema";

export type PopulatedTeam = TeamDocument & {
  primaryCoach: CoachDocument;
  coaches: CoachDocument[];
};

export type CreateTeamInput = {
  _id?: Types.ObjectId;
  tournamentId: Types.ObjectId | string;
  draftId?: Types.ObjectId | string;
  coach: Types.ObjectId | string;
  teamName: string;
  logo?: string;
  status?: TeamStatus;
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
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
    return team as unknown as PopulatedTeam;
  }

  async findBySlug(
    tournamentId: Types.ObjectId | string,
    slug: string,
  ): Promise<PopulatedTeam> {
    const team = await this.teamModel
      .findOne({ slug: { $eq: slug }, tournamentId })
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamSlug: slug });
    return team as unknown as PopulatedTeam;
  }

  async findIdsBySlugs(
    tournamentId: Types.ObjectId | string,
    slugs: string[],
  ): Promise<Types.ObjectId[]> {
    if (slugs.length === 0) return [];
    const teams = await this.teamModel
      .find({ slug: { $in: slugs }, tournamentId }, { _id: 1 })
      .lean()
      .exec();
    return teams.map((team) => team._id);
  }

  async isPokemonTakenInDraft(
    draftId: Types.ObjectId | string,
    pokemonId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const taken = await this.teamModel
      .exists({ draftId, "pickLog.pokemon.id": pokemonId })
      .session(session ?? null)
      .exec();
    return taken !== null;
  }

  async countInTournament(
    tournamentId: Types.ObjectId | string,
    teamIds: (Types.ObjectId | string)[],
  ): Promise<number> {
    if (teamIds.length === 0) return 0;
    return this.teamModel
      .countDocuments({ _id: { $in: teamIds }, tournamentId })
      .exec();
  }

  async findManyByIds(
    teamIds: (Types.ObjectId | string)[],
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ _id: { $in: teamIds } })
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async findByIdOrNull(
    teamId: Types.ObjectId | string,
  ): Promise<PopulatedTeam | null> {
    const team = await this.teamModel
      .findById(teamId)
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    return team as unknown as PopulatedTeam | null;
  }

  async findByCoachId(
    coachId: Types.ObjectId | string,
  ): Promise<PopulatedTeam | null> {
    const coachModel = this.teamModel.db.model<CoachDocument>("CoachEntity");
    const coach = await coachModel
      .findById(coachId)
      .select("teamId")
      .exec();
    if (!coach?.teamId) return null;
    return this.findByIdOrNull(coach.teamId);
  }

  async findAllByDraft(
    draftId: Types.ObjectId | string,
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ draftId })
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<PopulatedTeam[]> {
    const teams = await this.teamModel
      .find({ tournamentId })
      .populate<{ primaryCoach: CoachDocument }>("primaryCoach")
      .populate<{ coaches: CoachDocument[] }>("coaches")
      .exec();
    return teams as unknown as PopulatedTeam[];
  }

  async create(data: CreateTeamInput): Promise<PopulatedTeam> {
    const team = new this.teamModel({
      ...(data._id ? { _id: data._id } : {}),
      tournamentId: data.tournamentId,
      draftId: data.draftId,
      primaryCoach: data.coach,
      teamName: data.teamName,
      logo: data.logo,
      status: data.status ?? "approved",
      picks: [],
      pickLog: [],
    });
    await team.save();
    return this.findById(team._id);
  }

  async countApprovedByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<number> {
    return this.teamModel
      .countDocuments({ tournamentId, status: { $eq: "approved" } })
      .exec();
  }

  async updatePicks(
    teamId: Types.ObjectId | string,
    picks: TeamEntity["picks"],
  ): Promise<void> {
    const result = await this.teamModel
      .updateOne({ _id: teamId }, { $set: { picks } })
      .exec();
    if (result.matchedCount === 0)
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
  }

  async update(
    teamId: Types.ObjectId | string,
    data: {
      teamName?: string;
      logo?: string;
      status?: TeamStatus;
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

  async replaceCoach(
    teamId: Types.ObjectId | string,
    data: {
      primaryCoach: Types.ObjectId;
      teamName: string;
      logo?: string;
      nameChange?: {
        from: string;
        to: string;
        roundId?: Types.ObjectId;
        reason?: string;
        changedBy?: string;
      };
    },
  ): Promise<PopulatedTeam> {
    const set: Record<string, unknown> = {
      primaryCoach: data.primaryCoach,
      teamName: data.teamName,
    };
    if (data.logo !== undefined) set["logo"] = data.logo;

    const team = await this.teamModel.findByIdAndUpdate(teamId, {
      $set: set,
      ...(data.nameChange
        ? { $push: { nameHistory: { ...data.nameChange, changedAt: new Date() } } }
        : {}),
    });
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
    return this.findById(teamId);
  }

  async delete(teamId: Types.ObjectId | string): Promise<void> {
    const result = await this.teamModel.findByIdAndDelete(teamId);
    if (!result) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
  }
}
