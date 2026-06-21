import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import LeagueModel from "../../models/league/league.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";
import { DraftDocument, DraftEntity } from "./draft.schema";

export type { PopulatedTeam } from "@modules/team/team.repository";

export type PopulatedTournament = LeagueTournamentDocument & {
  tierList: LeagueTierListDocument;
};

/**
 * `teams` is composed in memory from a separate Team query, not a real schema
 * field on DraftEntity. It's attached here so the shared draft/standings
 * logic in services/league-services/*.ts keeps working against one object.
 */
export type PopulatedDraft = DraftDocument & {
  teams: PopulatedTeam[];
};

@Injectable()
export class DraftRepository {
  constructor(
    @InjectModel(DraftEntity.name)
    private readonly draftModel: Model<DraftDocument>,
    private readonly teamRepo: TeamRepository,
  ) {}

  async findTournament(
    leagueKey: string,
    tournamentKey: string,
  ): Promise<PopulatedTournament> {
    const league = await LeagueModel.findOne({ leagueKey }).exec();
    if (!league) throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey });

    const tournament = await LeagueTournamentModel.findOne({
      tournamentKey,
      league: league._id,
    }).populate<{ tierList: LeagueTierListDocument }>("tierList");
    if (!tournament)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentKey });
    return tournament as PopulatedTournament;
  }

  async findDraft(
    tournament: PopulatedTournament,
    draftKey: string,
  ): Promise<PopulatedDraft> {
    const draft = await this.draftModel
      .findOne({ tournamentId: tournament._id, draftKey })
      .exec();

    if (!draft)
      throw new PDZError(ErrorCodes.DRAFT.NOT_IN_LEAGUE, {
        draftKey,
        tournamentKey: tournament.tournamentKey,
      });

    const teams = await this.teamRepo.findAllByDraft(draft._id);
    return Object.assign(draft, { teams }) as PopulatedDraft;
  }

  async findTeamById(teamId: string): Promise<PopulatedTeam> {
    return this.teamRepo.findById(teamId);
  }

  /** Plain lookups (no composed teams array) for listing/membership checks. */
  async findById(
    draftId: Types.ObjectId | string,
  ): Promise<DraftDocument | null> {
    return this.draftModel.findById(draftId).exec();
  }

  async findManyByIds(
    draftIds: (Types.ObjectId | string)[],
  ): Promise<DraftDocument[]> {
    return this.draftModel.find({ _id: { $in: draftIds } }).exec();
  }

  async findPublicByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<DraftDocument[]> {
    return this.draftModel.find({ tournamentId, public: true }).exec();
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<DraftDocument[]> {
    return this.draftModel.find({ tournamentId }).exec();
  }

  async findTeamInDraftOrThrow(
    draft: PopulatedDraft,
    teamId: string,
  ): Promise<PopulatedTeam> {
    const team = await this.teamRepo.findById(teamId);
    const teams: PopulatedTeam[] = draft.teams;
    if (!teams.some((t: PopulatedTeam) => t._id.equals(team._id)))
      throw new PDZError(ErrorCodes.TEAM.NOT_IN_DRAFT, {
        teamId,
        draftKey: draft.draftKey,
      });
    return team;
  }
}
