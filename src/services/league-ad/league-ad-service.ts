import NodeCache from "node-cache";
import { LeagueAd } from "../../classes/league-ad";
import { LeagueAdModel } from "../../models/league-ad.model";

const cache = new NodeCache({ stdTTL: 3000 });
const CACHE_KEY = "approvedLeagues";

export function invalidateLeagueAdsCache(): void {
  cache.del(CACHE_KEY);
}

export async function getLeagueAds(): Promise<LeagueAd[]> {
  const cachedLeagues: LeagueAd[] | undefined = cache.get(CACHE_KEY);

  if (cachedLeagues) {
    return cachedLeagues;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const documents = await LeagueAdModel.find({
    closesAt: { $gte: today },
    status: "Approved",
  }).sort({ createdAt: -1 });
  const leagueAds = documents.map((doc) => LeagueAd.fromDocument(doc));
  cache.set(CACHE_KEY, leagueAds);
  return leagueAds;
}
