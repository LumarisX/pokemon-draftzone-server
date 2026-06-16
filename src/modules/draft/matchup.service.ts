import { Injectable } from "@nestjs/common";
import { LRUCache } from "lru-cache";
import { Types } from "mongoose";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../../models/draft/matchup.model";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";

@Injectable()
export class MatchupService {
  constructor() {}

  $matchupsByDraft = new LRUCache<string, MatchupDocument[]>({
    max: 100,
    ttl: 1000 * 60 * 5,
  });

  $matchups = new LRUCache<string, MatchupDocument>({ max: 100 });

  async createMatchup(matchupData: MatchupData) {
    const matchup = new MatchupModel(matchupData);
    await matchup.save();
    this.clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
    return matchup;
  }

  async getMatchupById(id: string): Promise<MatchupDocument> {
    if (this.$matchups.has(id)) return this.$matchups.get(id)!;
    const matchup = await MatchupModel.findById(id);
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    this.$matchups.set(id, matchup);
    return matchup;
  }

  async getMatchupByIdNew(id: string): Promise<MatchupDocument | null> {
    if (this.$matchups.has(id)) return this.$matchups.get(id)!;
    const matchup = await MatchupModel.findById(id);
    if (matchup) this.$matchups.set(id, matchup);
    return matchup;
  }

  async getMatchupsByDraftId(
    draftId: Types.ObjectId,
  ): Promise<MatchupDocument[]> {
    const cacheKey = draftId.toString();
    if (this.$matchupsByDraft.has(cacheKey))
      return this.$matchupsByDraft.get(cacheKey)!;

    const matchups = await MatchupModel.find({ "aTeam._id": draftId }).sort({
      createdAt: -1,
    });
    this.$matchupsByDraft.set(cacheKey, matchups);
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
    this.$matchups.delete(id);
    this.clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
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

    this.$matchups.delete(id);
    this.clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);

    const updatedMatchup = await MatchupModel.findById(id);
    if (!updatedMatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    return updatedMatchup;
  }

  async deleteMatchup(id: string) {
    const matchup = await this.getMatchupById(id);
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    const result = await MatchupModel.findByIdAndDelete(id);
    this.$matchups.delete(id);
    this.clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
    return result;
  }

  clearMatchupsByDraftCache(draftId: Types.ObjectId) {
    this.$matchupsByDraft.delete(draftId.toString());
  }

  clearMatchupCacheById(id: string) {
    this.$matchups.delete(id);
  }
}
