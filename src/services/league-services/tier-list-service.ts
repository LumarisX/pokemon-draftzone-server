import { ID } from "@pkmn/data";
import { Types } from "mongoose";
import { DraftSpecie } from "../../classes/pokemon";
import { getRuleset } from "../../data/rulesets";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import LeagueDivisionModel from "../../models/league/division.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import tierListModel, {
  LeagueTier,
  LeagueTierListDocument,
  LeagueTierListPokemon,
  TierListPokemonAddon,
} from "../../models/league/tier-list.model";
import LeagueTournamentModel, {
  LeagueTournament,
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import { get } from "http";
import { getName } from "../data-services/pokedex.service";

export async function getPokemonTier(
  tournamentId: Types.ObjectId | LeagueTournamentDocument,
  pokemonId: string,
): Promise<LeagueTier | undefined> {
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
    const tier = tierList.tiers.find((t) => t.name === pokemonData?.tier);
    return tier;
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
  tournament: LeagueTournament,
  showAll: boolean = false,
) {
  try {
    const tierList = await tierListModel.findById(tournament.tierList);
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
          Array.from(tierList.pokemon.entries())
            .filter(([pokemonId, pokemonData]) => {
              return pokemonData.tier === tier.name;
            })
            .map(async ([pokemonId, pokemonData]) => {
              const specie = new DraftSpecie(pokemonId as ID, ruleset);
              assignedPokemon.add(pokemonId);

              const learnableMoves = await Promise.all(
                tierList.bannedMoves.map(async (move) => ({
                  move,
                  canLearn: await specie.canLearn(move),
                })),
              );

              const bannedMoves = learnableMoves
                .filter(({ canLearn }) => canLearn)
                .map(({ move }) => move);
              const bannedAbilities = tierList.bannedAbilities.filter(
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
          .map((specie) => ({
            id: specie.id,
            name: specie.name,
          })),
      });
    }
    return tiers;
  } catch (error) {
    throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA);
  }
}

export async function getDrafted(
  tournament: LeagueTournamentDocument,
  divisionNames?: string | string[],
): Promise<{
  [key: string]: { pokemonId: string }[];
}> {
  const divisionFilter: string[] | undefined = divisionNames
    ? Array.isArray(divisionNames)
      ? divisionNames
      : [divisionNames]
    : undefined;

  const divisions = await LeagueDivisionModel.find({
    tournament: tournament._id,
    ...(divisionFilter && { divisionKey: { $in: divisionFilter } }),
  }).populate({
    path: "teams",
  });

  return divisions.reduce(
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

export async function getDraftedByTeam(
  tournament: LeagueTournamentDocument,
  divisionKey: string,
) {
  const division = await LeagueDivisionModel.findOne({
    tournament: tournament._id,
    divisionKey: divisionKey,
  }).populate({
    path: "teams",
    populate: {
      path: "coach",
    },
  });

  if (!division) return [];

  return (
    division.teams as (LeagueTeamDocument & {
      coach: LeagueCoachDocument;
    })[]
  ).map((team) => ({
    team: {
      name: team.coach.teamName,
      coachName: team.coach.name,
      id: team._id.toString(),
    },
    pokemon: team.draft.map((draft) => ({
      id: draft.pokemon.id,
      name: getName(draft.pokemon.id),
      addons: draft.addons,
    })),
  }));
}

export async function updateTierList(
  tournament: LeagueTournament,
  clientTiers: {
    name: string;
    cost: number;
    pokemon: { id: string; name: string }[];
  }[],
) {
  const tierList = await tierListModel.findById(tournament.tierList);
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

  const pokemonMap = new Map<string, LeagueTierListPokemon>();
  for (const tier of validTiers) {
    for (const pokemon of tier.pokemon) {
      const existingData = tierList.pokemon.get(pokemon.id);
      pokemonMap.set(pokemon.id, {
        name: pokemon.name,
        tier: tier.name,
        ...(existingData?.notes !== undefined && { notes: existingData.notes }),
        ...(existingData?.addons !== undefined && {
          addons: existingData.addons,
        }),
      });
    }
  }

  tierList.pokemon = pokemonMap;
  await tierList.save();

  return tierList;
}
