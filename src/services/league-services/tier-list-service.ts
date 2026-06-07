import { Types } from "mongoose";
import { ErrorCodes } from "../../errors/error-codes";
import { PDZError } from "../../errors/pdz-error";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import LeagueDivisionModel from "../../models/league/division.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import tierListModel, {
  LeagueTierListPokemon,
} from "../../models/league/tier-list.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { getName } from "../data-services/pokedex.service";
import { UNTIERED_TIER_NAME } from "../tier-lists-services/tier-list-service";
import { getRosterByStage } from "./league-service";

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
          const teamDrafts = getRosterByStage(
            team,
            division,
            division.stages.length,
          ).map((pokemon) => ({
            pokemonId: pokemon.id,
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
      name: team.teamName,
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
  tierListId: Types.ObjectId | string,
  clientTiers: {
    name: string;
    cost: number;
    pokemon: {
      id: string;
      name: string;
      banned?: boolean;
      notes?: string;
      bannedAbilities?: string[];
    }[];
  }[],
) {
  const tierList = await tierListModel.findById(tierListId);
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

  const nextBannedAbilities = new Set<string>();

  const pokemonMap = new Map<string, LeagueTierListPokemon>();
  for (const tier of validTiers) {
    for (const pokemon of tier.pokemon) {
      pokemon.bannedAbilities?.forEach((ability) =>
        nextBannedAbilities.add(ability),
      );
      const existingData = tierList.pokemon.get(pokemon.id);
      pokemonMap.set(pokemon.id, {
        name: pokemon.name,
        tier: tier.name,
        ...(pokemon.banned !== undefined && { banned: pokemon.banned }),
        ...(pokemon.notes !== undefined && { notes: pokemon.notes }),
        ...(existingData?.addons !== undefined && {
          addons: existingData.addons,
        }),
      });
    }
  }

  // Persist banned pokemon sent in the untiered section, preserving their original tier.
  const untieredClientTier = clientTiers.find(
    (tier) => tier.name.toLowerCase() === UNTIERED_TIER_NAME.toLowerCase(),
  );
  if (untieredClientTier) {
    for (const pokemon of untieredClientTier.pokemon) {
      if (pokemon.banned) {
        pokemon.bannedAbilities?.forEach((ability) =>
          nextBannedAbilities.add(ability),
        );
        const existingData = tierList.pokemon.get(pokemon.id);
        pokemonMap.set(pokemon.id, {
          name: pokemon.name,
          tier: existingData?.tier ?? UNTIERED_TIER_NAME,
          banned: true,
          ...(pokemon.notes !== undefined && { notes: pokemon.notes }),
          ...(existingData?.addons !== undefined && {
            addons: existingData.addons,
          }),
        });
      }
    }
  }

  tierList.pokemon = pokemonMap;
  tierList.banned.abilities = Array.from(nextBannedAbilities);
  await tierList.save();

  return tierList;
}
