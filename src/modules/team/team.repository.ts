import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachDocument } from "@modules/coach/coach.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ClientSession, Model, Types } from "mongoose";
import { NamedTeam, TeamNameAssignment } from "./domain/team-names";
import {
  TeamDocument,
  TeamEntity,
  TeamAchievementEntity,
  TeamOutcomeEntity,
  TeamStatus,
} from "./team.schema";

export type PopulatedTeam = TeamDocument & {
  primaryCoach: CoachDocument;
  coaches: CoachDocument[];
};

export type TeamNameChange = {
  from: string;
  to: string;
  roundId?: Types.ObjectId;
  reason?: string;
  changedBy?: string;
};

export type CreateTeamInput = {
  _id?: Types.ObjectId;
  tournamentId: Types.ObjectId | string;
  draftId?: Types.ObjectId | string;
  coach: Types.ObjectId | string;
  teamName: string;
  logo?: string;
  identityId?: Types.ObjectId;
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

  async findLinkedToIdentity(
    identityId: Types.ObjectId | string,
  ): Promise<{ id: Types.ObjectId; tournamentId: Types.ObjectId; teamName: string; baseName: string }[]> {
    const teams = await this.teamModel
      .find(
        { identityId: new Types.ObjectId(identityId.toString()) },
        { tournamentId: 1, teamName: 1, baseName: 1 },
      )
      .lean()
      .exec();
    return teams.map((team) => ({
      id: team._id,
      tournamentId: team.tournamentId,
      teamName: team.teamName,
      baseName: team.baseName ?? team.teamName,
    }));
  }

  async findNamesByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<NamedTeam[]> {
    const teams = await this.teamModel
      .find({ tournamentId }, { teamName: 1, baseName: 1, nameVariant: 1 })
      .sort({ _id: 1 })
      .lean()
      .exec();
    return teams.map((team) => ({
      id: team._id.toString(),
      baseName: team.baseName ?? team.teamName,
      ...(team.nameVariant === undefined || team.nameVariant === null
        ? {}
        : { variant: team.nameVariant }),
    }));
  }

  async setNameVariants(assignments: TeamNameAssignment[]): Promise<void> {
    if (assignments.length === 0) return;
    await this.teamModel.bulkWrite(
      assignments.map((assignment) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(assignment.id) },
          update: {
            $set: {
              teamName: assignment.teamName,
              baseName: assignment.baseName,
              nameVariant: assignment.variant,
            },
          },
        },
      })),
    );
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
      baseName: data.teamName,
      logo: data.logo,
      identityId: data.identityId,
      status: data.status ?? "approved",
      picks: [],
      pickLog: [],
    });
    await team.save();
    return this.findById(team._id);
  }

  async setOutcomes(
    tournamentId: Types.ObjectId | string,
    outcomes: Map<
      string,
      Omit<TeamOutcomeEntity, "label" | "mvp" | "top" | "achievements"> & {
        label?: string | null;
        mvp?: TeamOutcomeEntity["mvp"] | null;
        top?: TeamOutcomeEntity["top"];
        achievements?: {
          id: string;
          rarity: string;
          tier: number;
          count: number;
          earnedAt: Date | null;
        }[];
      }
    >,
  ): Promise<void> {
    await this.clearOutcomes(tournamentId);
    if (outcomes.size === 0) return;
    await this.teamModel.bulkWrite(
      [...outcomes].map(([teamId, outcome]) => {
        const stored: TeamOutcomeEntity = {
          placement: outcome.placement,
          of: outcome.of,
          champion: outcome.champion,
        };
        if (outcome.label) stored.label = outcome.label;
        if (outcome.wins !== undefined) stored.wins = outcome.wins;
        if (outcome.losses !== undefined) stored.losses = outcome.losses;
        if (outcome.draws !== undefined) stored.draws = outcome.draws;
        if (outcome.mvp)
          stored.mvp = {
            id: outcome.mvp.id,
            name: outcome.mvp.name,
            kills: outcome.mvp.kills,
          };
        if (outcome.top?.length)
          stored.top = outcome.top.map((entry) => ({
            id: entry.id,
            name: entry.name,
            kills: entry.kills,
          }));
        if (outcome.achievements?.length)
          stored.achievements = outcome.achievements.map((earned) => {
            const entry: TeamAchievementEntity = {
              id: earned.id,
              rarity: earned.rarity,
              tier: earned.tier,
              count: earned.count,
            };
            if (earned.earnedAt) entry.earnedAt = earned.earnedAt;
            return entry;
          });
        return {
          updateOne: {
            filter: { _id: new Types.ObjectId(teamId), tournamentId },
            update: { $set: { outcome: stored } },
          },
        };
      }),
    );
  }

  async clearOutcomes(tournamentId: Types.ObjectId | string): Promise<void> {
    await this.teamModel
      .updateMany({ tournamentId }, { $unset: { outcome: "" } })
      .exec();
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
      identityId?: Types.ObjectId | null;
      nameLockedBy?: string | null;
      status?: TeamStatus;
      draftId?: Types.ObjectId | string | null;
      nameChange?: TeamNameChange;
    },
  ): Promise<PopulatedTeam> {
    const update: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    if (data.nameLockedBy === null) unset["nameLockedBy"] = "";
    else if (data.nameLockedBy !== undefined)
      update["nameLockedBy"] = data.nameLockedBy;
    if (data.teamName !== undefined) {
      update["teamName"] = data.teamName;
      update["baseName"] = data.teamName;
      unset["nameVariant"] = "";
    }
    if (data.logo !== undefined) update["logo"] = data.logo;
    if (data.identityId === null) unset["identityId"] = "";
    else if (data.identityId !== undefined) update["identityId"] = data.identityId;
    if (data.status !== undefined) update["status"] = data.status;
    if (data.draftId !== undefined) {
      if (data.draftId === null) unset["draftId"] = "";
      else update["draftId"] = data.draftId;
    }

    const team = await this.teamModel.findByIdAndUpdate(teamId, {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      ...(data.nameChange
        ? { $push: { nameHistory: { ...data.nameChange, changedAt: new Date() } } }
        : {}),
    });
    if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });
    return this.findById(teamId);
  }

  async replaceCoach(
    teamId: Types.ObjectId | string,
    data: {
      primaryCoach: Types.ObjectId;
      teamName?: string;
      logo?: string;
      identityId?: Types.ObjectId | null;
      nameChange?: TeamNameChange;
    },
  ): Promise<PopulatedTeam> {
    const set: Record<string, unknown> = {
      primaryCoach: data.primaryCoach,
    };
    const unset: Record<string, unknown> = {};
    if (data.identityId === null) unset["identityId"] = "";
    else if (data.identityId !== undefined) set["identityId"] = data.identityId;
    if (data.teamName !== undefined) {
      set["teamName"] = data.teamName;
      set["baseName"] = data.teamName;
      unset["nameVariant"] = "";
    }
    if (data.logo !== undefined) set["logo"] = data.logo;

    const team = await this.teamModel.findByIdAndUpdate(teamId, {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
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
