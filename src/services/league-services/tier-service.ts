import { Types } from "mongoose";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";
import { DraftTierListDocument } from "../../models/league/tier-list.model";

export async function getPokemonTier(
  leagueId: Types.ObjectId | LeagueDocument,
  pokemonId: string
): Promise<string | undefined> {
  try {
    const league =
      "tierList" in leagueId
        ? await leagueId.populate<{
            tierList: DraftTierListDocument;
          }>("tierList")
        : await LeagueModel.findById(leagueId).populate<{
            tierList: DraftTierListDocument;
          }>("tierList");

    if (!league || !league.tierList) {
      return undefined;
    }

    const tierList = league.tierList as DraftTierListDocument;
    for (const tierGroup of tierList.tierGroups) {
      for (const tier of tierGroup.tiers) {
        if (tier.pokemon.includes(pokemonId)) {
          return tier.name;
        }
      }
    }

    return undefined;
  } catch (error) {
    console.error(
      `Error getting pokemon tier for ${pokemonId} in league ${leagueId}:`,
      error
    );
    return undefined;
  }
}
