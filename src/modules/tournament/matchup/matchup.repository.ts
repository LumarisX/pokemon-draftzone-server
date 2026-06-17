import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  MatchupDocument,
  MatchupData,
} from "../../../models/draft/matchup.model";
import { Matchup } from "./matchup.domain";
import { ErrorCodes } from "../../../errors/error-codes";
import { PDZError } from "../../../errors/pdz-error";

@Injectable()
export class MatchupRepository {
  constructor(
    @InjectModel(Matchup.name)
    private readonly matchupModel: Model<MatchupDocument>,
  ) {}

  async create(matchupData: MatchupData): Promise<MatchupDocument> {
    const matchup = new this.matchupModel(matchupData);
    return matchup.save();
  }

  async findById(id: string): Promise<MatchupDocument> {
    const matchup = await this.matchupModel.findById(id).exec();
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return matchup;
  }

  async findByTournamentId(
    tournamentId: Types.ObjectId,
  ): Promise<MatchupDocument[]> {
    return this.matchupModel
      .find({ "aTeam._id": new Types.ObjectId(tournamentId) })
      .exec();
  }
  async update(
    id: string,
    updateData: Partial<MatchupData>,
  ): Promise<MatchupDocument | null> {
    return this.matchupModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
  }

  async updateScore(
    id: string,
    matches: MatchupData["matches"],
    aTeamPaste?: string,
    bTeamPaste?: string,
  ): Promise<MatchupDocument | null> {
    const setData: { [key: string]: unknown } = { matches };
    if (aTeamPaste !== undefined) setData["aTeam.paste"] = aTeamPaste;
    if (bTeamPaste !== undefined) setData["bTeam.paste"] = bTeamPaste;

    return this.matchupModel
      .findByIdAndUpdate(id, { $set: setData }, { new: true })
      .exec();
  }
}
