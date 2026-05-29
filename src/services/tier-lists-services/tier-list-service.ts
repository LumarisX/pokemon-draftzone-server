import { ID } from "@pkmn/data";
import { Types } from "mongoose";
import { DraftSpecie } from "../../classes/pokemon";
import { getRuleset } from "../../data/rulesets";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import tierListModel, {
  TierListPokemonAddon,
} from "../../models/league/tier-list.model";

export const UNTIERED_TIER_NAME = "Untiered";
export async function getTierList(
  tierListId: Types.ObjectId | string,
  showAll: boolean = false,
) {
  try {
    const tierList = await tierListModel.findById(tierListId);
    if (!tierList) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);

    const ruleset = getRuleset(tierList.ruleset);
    const assignedPokemon = new Set<string>();

    const tiers: {
      name: string;
      cost?: number;
      pokemon: {
        id: string;
        name: string;
        notes?: string;
        addons?: TierListPokemonAddon[];
        draftBanned?: boolean;
        banned?: {
          moves?: string[];
          abilities?: string[];
        };
      }[];
    }[] = await Promise.all(
      tierList.tiers.map(async (tier) => {
        const pokemon = await Promise.all(
          Array.from(tierList.pokemon.entries())
            .filter(([pokemonId, pokemonData]) => {
              return pokemonData.tier === tier.name;
            })
            .map(async ([pokemonId, pokemonData]) => {
              const specie = new DraftSpecie(pokemonId as ID, ruleset);
              assignedPokemon.add(pokemonId);

              const learnableMoves = await Promise.all(
                tierList.banned.moves.map(async (move) => ({
                  move,
                  canLearn: await specie.canLearn(move),
                })),
              );

              const bannedMoves = learnableMoves
                .filter(({ canLearn }) => canLearn)
                .map(({ move }) => move);
              const bannedAbilities = tierList.banned.abilities.filter(
                (ability) => Object.values(specie.abilities).includes(ability),
              );

              return {
                id: pokemonId,
                name: pokemonData.name,
                types: specie.types,
                abilities: Object.values(specie.abilities),
                bst: specie.bst,
                stats: specie.baseStats,
                notes: pokemonData.notes,
                ...(pokemonData.banned && { draftBanned: true }),
                ...(pokemonData.addons?.length && {
                  addons: pokemonData.addons,
                }),
                ...((bannedMoves.length || bannedAbilities.length) && {
                  banned: {
                    ...(bannedMoves.length && { moves: bannedMoves }),
                    ...(bannedAbilities.length && {
                      abilities: bannedAbilities,
                    }),
                  },
                }),
              };
            }),
        );
        return {
          name: tier.name,
          cost: tier.cost,
          pokemon,
        };
      }),
    );

    if (showAll) {
      tiers.push({
        name: UNTIERED_TIER_NAME,
        pokemon: Array.from(ruleset.species)
          .filter((specie) => !assignedPokemon.has(specie.id))
          .map((specie) => {
            const pokemonData = tierList.pokemon.get(specie.id);
            return {
              id: specie.id,
              name: specie.name,
              ...(pokemonData?.banned && { draftBanned: true }),
            };
          }),
      });
    }
    return tiers;
  } catch (error) {
    throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA);
  }
}
