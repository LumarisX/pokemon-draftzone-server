import { Types } from "mongoose";
import LeagueModel, { LeagueDocument } from "../../models/league/league.model";
import {
  DraftTierListDocument,
  DraftTierGroup,
} from "../../models/league/tier-list-old.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";

/**
 * Converts new tier list format to old tier list format for backward compatibility.
 * Groups pokemon by tier and returns the old tierGroups structure.
 */
export function convertToOldFormat(
  newTierList: LeagueTierListDocument,
): Pick<DraftTierListDocument, "tierGroups"> {
  const tierGroups: DraftTierGroup[] = [
    {
      name: "",
      order: 0,
      tiers: newTierList.tiers.map((tier, index) => {
        // Get all pokemon IDs that belong to this tier
        const pokemonIds: string[] = [];

        newTierList.pokemon.forEach((data, id) => {
          if (data.tier === tier.name) {
            pokemonIds.push(id);
          }
        });

        return {
          name: tier.name,
          order: index,
          labels: tier.label ? [tier.label] : [tier.name],
          pokemon: pokemonIds,
        };
      }),
    },
  ];

  return { tierGroups };
}

export async function getPokemonTier(
  leagueId: Types.ObjectId | LeagueDocument,
  pokemonId: string,
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
      error,
    );
    return undefined;
  }
}
