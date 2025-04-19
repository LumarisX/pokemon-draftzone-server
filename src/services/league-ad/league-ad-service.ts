import NodeCache from "node-cache";
import { LeagueAdDocument, LeagueAdModel } from "../../models/leaguelist.model";

const cache = new NodeCache({ stdTTL: 3000 });

export async function getApprovedLeagues(): Promise<LeagueAdDocument[]> {
  const cacheKey = "approvedLeagues";
  const cachedLeagues: LeagueAdDocument[] | undefined = cache.get(cacheKey);

  if (cachedLeagues) {
    return cachedLeagues;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const leagues: LeagueAdDocument[] = await LeagueAdModel.find({
    status: "Approved",
    closesAt: { $gte: today },
  })
    .sort({
      createdAt: -1,
    })
    .lean();

  cache.set(cacheKey, leagues);
  return leagues;
}
