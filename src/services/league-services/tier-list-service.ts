import { Types } from "mongoose";
import LeagueTournamentModel, {
  LeagueTournament,
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";
import tierListModel, {
  LeagueTierListDocument,
  LeagueTierListPokemon,
  TierListPokemonAddon,
} from "../../models/league/tier-list.model";
import { ID } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";
import { getRuleset } from "../../data/rulesets";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import { LeagueTeamDocument } from "../../models/league/team.model";

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
    const pokemonData = tierList.pokemon[pokemonId];

    return pokemonData?.tier;
  } catch (error) {
    console.error(
      `Error getting pokemon tier for ${pokemonId} in league ${tournamentId}:`,
      error,
    );
    return undefined;
  }
}

const UNTIERED_TIER_NAME = "Untiered";
export async function getTierList(
  league: LeagueTournament,
  showAll: boolean = false,
) {
  const tierList = await tierListModel.findById(league.tierList);
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
      banned?: {
        moves?: string[];
        abilities?: string[];
      };
    }[];
  }[] = await Promise.all(
    tierList.tiers.map(async (tier) => {
      const pokemon = await Promise.all(
        Object.entries(tierList.pokemon)
          .filter(([pokemonId, pokemonData]) => pokemonData.tier === tier.name)
          .map(async ([pokemonId, pokemonData]) => {
            const specie = new DraftSpecie(pokemonId as ID, ruleset);
            assignedPokemon.add(pokemonId);

            const learnableMoves = await Promise.all(
              tierList.bannedMoves.map(async (move) => ({
                move,
                canLearn: await specie.canLearn(move),
              })),
            );

            return {
              id: pokemonId,
              name: pokemonData.name,
              notes: pokemonData.notes,
              addons: pokemonData.addons,
              banned: {
                moves: learnableMoves
                  .filter(({ canLearn }) => canLearn)
                  .map(({ move }) => move),
                abilities: tierList.bannedAbilities.filter((ability) =>
                  Object.values(specie.abilities).includes(ability),
                ),
              },
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
        .map((specie) => ({
          id: specie.id,
          name: specie.name,
        })),
    });
  }

  return tiers;
}

export async function getDrafted(
  league: LeagueTournamentDocument,
  divisionNames?: string | string[],
): Promise<{
  [key: string]: { pokemonId: string }[];
}> {
  await league.populate([
    {
      path: "divisions",
      populate: {
        path: "teams",
      },
    },
  ]);

  const divisionNameSet = divisionNames
    ? new Set(Array.isArray(divisionNames) ? divisionNames : [divisionNames])
    : null;

  return (league.divisions as LeagueDivisionDocument[])
    .filter((division) =>
      divisionNameSet ? divisionNameSet.has(division.divisionKey) : true,
    )
    .reduce(
      (acc, division) => {
        acc[division.name] = (division.teams as LeagueTeamDocument[]).reduce(
          (teamAcc, team) => {
            const teamDrafts = team.draft.map((draft) => ({
              pokemonId: draft.pokemon.id,
            }));
            return [...teamAcc, ...teamDrafts];
          },
          [] as { pokemonId: string }[],
        );

        return acc;
      },
      {} as { [key: string]: { pokemonId: string }[] },
    );
}

export async function updateTierList(
  league: LeagueTournament,
  clientTiers: {
    name: string;
    cost: number;
    pokemon: { id: string; name: string }[];
  }[],
) {
  const tierList = await tierListModel.findById(league.tierList);
  if (!tierList) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);

  const validTiers = clientTiers.filter(
    (tier) => tier.name.toLowerCase() !== UNTIERED_TIER_NAME.toLowerCase(),
  );

  const existingTierMap = new Map(tierList.tiers.map((t) => [t.name, t]));

  tierList.tiers = validTiers.map((tier) => ({
    ...(existingTierMap.get(tier.name) || {}),
    name: tier.name,
    cost: tier.cost,
  }));

  const pokemonMap: { [key: string]: LeagueTierListPokemon } = {};
  for (const tier of validTiers) {
    for (const pokemon of tier.pokemon) {
      const existingData = tierList.pokemon[pokemon.id];
      pokemonMap[pokemon.id] = {
        name: pokemon.name,
        tier: tier.name,
        ...(existingData?.notes !== undefined && { notes: existingData.notes }),
        ...(existingData?.addons !== undefined && {
          addons: existingData.addons,
        }),
      };
    }
  }

  tierList.pokemon = pokemonMap;
  await tierList.save();

  return tierList;
}
