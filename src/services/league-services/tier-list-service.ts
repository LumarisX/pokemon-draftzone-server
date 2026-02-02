import { Types } from "mongoose";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";

export async function getPokemonTier(
  tournamentId: Types.ObjectId | LeagueTournamentDocument,
  pokemonId: string,
): Promise<string | undefined> {
  try {
    const league =
      "tierList" in tournamentId
        ? await tournamentId.populate<{
            tierList: LeagueTierListDocument;
          }>("tierList")
        : await LeagueTournamentModel.findById(tournamentId).populate<{
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
      `Error getting pokemon tier for ${pokemonId} in league ${tournamentId}:`,
      error,
    );
    return undefined;
  }
}
