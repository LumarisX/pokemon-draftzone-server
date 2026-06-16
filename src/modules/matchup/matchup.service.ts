import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../../models/draft/matchup.model";

@Injectable()
export class MatchupService {
  getMatchup(tournamentId: string, matchupId: string) {
    throw new Error("Method not implemented.");
  }
  getByTournamentId(tournamentId: string) {
    throw new Error("Method not implemented.");
  }
  constructor() {}

  async createMatchup(matchupData: MatchupData) {
    const matchup = new MatchupModel(matchupData);
    await matchup.save();
    return matchup;
  }

  async getMatchupById(id: string): Promise<MatchupDocument> {
    const matchup = await MatchupModel.findById(id);
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return matchup;
  }

  async getMatchupByIdNew(id: string): Promise<MatchupDocument | null> {
    const matchup = await MatchupModel.findById(id);
    return matchup;
  }

  async getMatchupsByDraftId(
    draftId: Types.ObjectId,
  ): Promise<MatchupDocument[]> {
    const matchups = await MatchupModel.find({ "aTeam._id": draftId }).sort({
      createdAt: -1,
    });
    return matchups;
  }

  async updateMatchup(
    id: string,
    data: { [key: string]: any },
  ): Promise<MatchupDocument | null> {
    const matchup = await MatchupModel.findByIdAndUpdate(id, data, {
      new: true,
      upsert: true,
    });
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return matchup;
  }

  async updateMatchupScore(
    id: string,
    matches: MatchupData["matches"],
    aTeamPaste?: string,
    bTeamPaste?: string,
  ): Promise<MatchupDocument> {
    const matchup = await this.getMatchupById(id);
    const setData: { [key: string]: unknown } = { matches };
    if (aTeamPaste !== undefined) setData["aTeam.paste"] = aTeamPaste;
    if (bTeamPaste !== undefined) setData["bTeam.paste"] = bTeamPaste;

    await MatchupModel.collection.updateOne(
      { _id: matchup._id },
      { $set: setData },
    );

    const updatedMatchup = await MatchupModel.findById(id);
    if (!updatedMatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return updatedMatchup;
  }

  async deleteMatchup(id: string) {
    const matchup = await this.getMatchupById(id);
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    const result = await MatchupModel.findByIdAndDelete(id);
    return result;
  }
}
