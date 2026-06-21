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
import { DivisionDocument, DivisionEntity } from "./division.schema";

export type { PopulatedTeam } from "@modules/team/team.repository";

export type PopulatedTournament = LeagueTournamentDocument & {
  tierList: LeagueTierListDocument;
};

/**
 * `teams` is composed in memory from a separate Team query, not a real schema
 * field on DivisionEntity (Division no longer stores a teams array). It's
 * attached here so the shared draft/standings logic in
 * services/league-services/*.ts — written against the legacy
 * division.teams shape — keeps working unmodified.
 */
export type PopulatedDivision = DivisionDocument & {
  teams: PopulatedTeam[];
};

@Injectable()
export class DivisionRepository {
  constructor(
    @InjectModel(DivisionEntity.name)
    private readonly divisionModel: Model<DivisionDocument>,
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

  async findDivision(
    tournament: PopulatedTournament,
    divisionKey: string,
  ): Promise<PopulatedDivision> {
    const division = await this.divisionModel
      .findOne({ tournamentId: tournament._id, divisionKey })
      .exec();

    if (!division)
      throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
        divisionKey,
        tournamentKey: tournament.tournamentKey,
      });

    const teams = await this.teamRepo.findAllByDivision(division._id);
    return Object.assign(division, { teams }) as PopulatedDivision;
  }

  async findTeamById(teamId: string): Promise<PopulatedTeam> {
    return this.teamRepo.findById(teamId);
  }

  /** Plain lookups (no composed teams array) for listing/membership checks. */
  async findById(
    divisionId: Types.ObjectId | string,
  ): Promise<DivisionDocument | null> {
    return this.divisionModel.findById(divisionId).exec();
  }

  async findManyByIds(
    divisionIds: (Types.ObjectId | string)[],
  ): Promise<DivisionDocument[]> {
    return this.divisionModel.find({ _id: { $in: divisionIds } }).exec();
  }

  async findPublicByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<DivisionDocument[]> {
    return this.divisionModel.find({ tournamentId, public: true }).exec();
  }

  async findAllByTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<DivisionDocument[]> {
    return this.divisionModel.find({ tournamentId }).exec();
  }

  async findTeamInDivisionOrThrow(
    division: PopulatedDivision,
    teamId: string,
  ): Promise<PopulatedTeam> {
    const team = await this.teamRepo.findById(teamId);
    const teams: PopulatedTeam[] = division.teams;
    if (!teams.some((t: PopulatedTeam) => t._id.equals(team._id)))
      throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
        teamId,
        divisionKey: division.divisionKey,
      });
    return team;
  }
}
