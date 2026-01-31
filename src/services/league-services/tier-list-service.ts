import { Types } from "mongoose";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";

export async function getPokemonTier(
  leagueId: Types.ObjectId | LeagueDocument,
  pokemonId: string,
): Promise<string | undefined> {
  try {
    const league =
      "tierList" in leagueId
        ? await leagueId.populate<{
            tierList: LeagueTierListDocument;
          }>("tierList")
        : await LeagueModel.findById(leagueId).populate<{
            tierList: LeagueTierListDocument;
          }>("tierList");

    if (!league || !league.tierList) {
      return undefined;
    }

    const tierList = league.tierList as LeagueTierListDocument;
    const pokemonData = tierList.pokemon.get(pokemonId);

    return pokemonData?.tier;
  } catch (error) {
    console.error(
      `Error getting pokemon tier for ${pokemonId} in league ${leagueId}:`,
      error,
    );
    return undefined;
  }
}
