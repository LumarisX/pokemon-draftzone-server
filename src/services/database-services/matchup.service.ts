import { LRUCache } from "lru-cache";
import { Types } from "mongoose";
import {
  MatchupData,
  MatchupDocument,
  MatchupModel,
} from "../../models/draft/matchup.model";

const $matchupsByDraft = new LRUCache<string, MatchupDocument[]>({
  max: 100,
  ttl: 1000 * 60 * 5,
});

const $matchups = new LRUCache<string, MatchupDocument>({ max: 100 });

export async function createMatchup(matchupData: MatchupData) {
  const matchup = new MatchupModel(matchupData);
  await matchup.save();
  clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
  return matchup;
}

export async function getMatchupById(
  id: string
): Promise<MatchupDocument | null> {
  if ($matchups.has(id)) {
    return $matchups.get(id)!;
  }

  const matchup = await MatchupModel.findById(id);
  if (matchup) {
    $matchups.set(id, matchup);
  }
  return matchup;
}

export async function getMatchupsByDraftId(
  draftId: Types.ObjectId
): Promise<MatchupDocument[]> {
  const cacheKey = draftId.toString();
  if ($matchupsByDraft.has(cacheKey)) {
    return $matchupsByDraft.get(cacheKey)!;
  }

  const matchups = await MatchupModel.find({ "aTeam._id": draftId }).sort({
    createdAt: -1,
  });
  $matchupsByDraft.set(cacheKey, matchups);
  return matchups;
}

export async function updateMatchup(
  id: string,
  data: { [key: string]: any }
): Promise<MatchupDocument | null> {
  const matchup = await MatchupModel.findByIdAndUpdate(id, data, {
    new: true,
    upsert: true,
  });

  if (matchup) {
    $matchups.delete(id);
    clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
  }

  return matchup;
}

export async function deleteMatchup(id: string) {
  const matchup = await getMatchupById(id);
  if (!matchup) return;

  const result = await MatchupModel.findByIdAndDelete(id);
  $matchups.delete(id);
  clearMatchupsByDraftCache(matchup.aTeam._id as Types.ObjectId);
  return result;
}

export function clearMatchupsByDraftCache(draftId: Types.ObjectId) {
  $matchupsByDraft.delete(draftId.toString());
}

export function clearMatchupCacheById(id: string) {
  $matchups.delete(id);
}
