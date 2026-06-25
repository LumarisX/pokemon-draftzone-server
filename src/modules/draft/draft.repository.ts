import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { TierList } from "@modules/tier-list/tier-list.domain";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DraftDocument, DraftEntity } from "./draft.schema";

export type { PopulatedTeam } from "@modules/team/team.repository";

export type PopulatedTournament = HostedTournament & {
  tierList: TierList;
};

export type PopulatedDraft = DraftDocument & {
  teams: PopulatedTeam[];
};

@Injectable()
export class DraftRepository {
  constructor(
    @InjectModel(DraftEntity.name)
    private readonly draftModel: Model<DraftDocument>,
    private readonly teamRepo: TeamRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
  ) {}

  async findTournament(
    leagueKey: string,
    tournamentKey: string,
  ): Promise<PopulatedTournament> {
    const tournament = await this.hostedTournamentRepo.findByKey(
      leagueKey,
      tournamentKey,
    );
    const tierList = await this.tierListRepo.findById(tournament.tierListId);
    return Object.assign(tournament, { tierList }) as PopulatedTournament;
  }

  async findDraft(
    tournament: PopulatedTournament,
    draftKey: string,
  ): Promise<PopulatedDraft> {
    const draft = await this.draftModel
      .findOne({ tournamentId: tournament.id, draftKey })
      .exec();

    if (!draft)
      throw new PDZError(ErrorCodes.DRAFT.NOT_IN_LEAGUE, {
        draftKey,
        tournamentKey: tournament.tournamentKey,
      });

    const teams = await this.teamRepo.findAllByDraft(draft._id);
    return Object.assign(draft, { teams }) as PopulatedDraft;
  }

  async findPopulatedById(
    draftId: Types.ObjectId | string,
  ): Promise<PopulatedDraft> {
    const draft = await this.draftModel.findById(draftId).exec();
    if (!draft)
      throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND, {
        draftId: draftId.toString(),
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
