import { Rulesets } from "../data/rulesets";
import { getStats } from "../services/database-services/draft.services";

export async function statsTest() {
  return await getStats(Rulesets["Gen9 NatDex"], "65ecb9da2f6bf04ab58146af");
}
