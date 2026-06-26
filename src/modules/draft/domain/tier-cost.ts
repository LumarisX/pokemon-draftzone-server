import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { TeamPickEntity } from "@modules/team/team.schema";
import { TierList } from "@modules/tier-list/tier-list.domain";
import { getPokemonIdFromDraft, isAlreadyDrafted } from "./pick-order";

/**
 * Creates a map of pokemonId to tier for faster lookups
 * @param tournament - The tournament document with a populated tierList
 * @returns A map where keys are pokemonIds and values are tier names
 */
export function createPokemonTierMap(
  tournament: PopulatedTournament,
): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = tournament.tierList;
  Array.from(tierList.pokemon.entries()).forEach(([pokemonId, data]) => {
    tierMap.set(pokemonId, data.tier);
  });
  return tierMap;
}

function getBaseTierCost(tierList: TierList, pokemonId: string): number {
  const pokemonData = tierList.pokemon.get(pokemonId);
  if (!pokemonData) {
    return 0;
  }
  return (
    tierList.tiers.find((tier) => tier.name === pokemonData.tier)?.cost || 0
  );
}

function getAddonCost(
  tierList: TierList,
  pokemonId: string,
  selectedAddons?: string[],
): number {
  if (!selectedAddons?.length) {
    return 0;
  }

  const pokemonData = tierList.pokemon.get(pokemonId);
  const addons = pokemonData?.addons;
  if (!addons?.length) {
    return 0;
  }

  const selectedAddonSet = new Set(selectedAddons);
  return addons
    .filter((addon) => selectedAddonSet.has(addon.name))
    .reduce((total, addon) => total + addon.cost, 0);
}

export function getPickCost(
  tierList: TierList,
  pick: { pokemonId: string; addons?: string[] },
): number {
  const baseCost = getBaseTierCost(tierList, pick.pokemonId);
  if (pick.addons?.length) {
    return baseCost + getAddonCost(tierList, pick.pokemonId, pick.addons);
  }

  return baseCost;
}

export function areAddonsValid(
  tierList: TierList,
  pick: TeamPickEntity,
): boolean {
  if (!pick.addons?.length) {
    return true;
  }

  const pokemonData = tierList.pokemon.get(pick.pokemonId);
  if (!pokemonData?.addons?.length) {
    return false;
  }

  const validAddonNames = new Set(
    pokemonData.addons.map((addon) => addon.name),
  );
  const selectedAddonSet = new Set(pick.addons);

  if (selectedAddonSet.size !== pick.addons.length) {
    return false;
  }

  return pick.addons.every((addonName) => validAddonNames.has(addonName));
}

export async function getTeamPoints(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
) {
  const tierList = tournament.tierList;
  const teamPoints = team.pickLog.reduce(
    (total, draftPick) =>
      total +
      getPickCost(tierList, {
        pokemonId: getPokemonIdFromDraft(draftPick),
        addons: draftPick.addons,
      }),
    0,
  );
  return teamPoints;
}

export async function teamHasEnoughPoints(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPickEntity,
): Promise<boolean> {
  const tierList = tournament.tierList;
  if (!tierList.pokemon.has(pick.pokemonId)) return false;

  const pickCost = getPickCost(tierList, pick);
  const maxPoints = tierList.pointTotal;
  if (!maxPoints) return true;

  const currentTeamPoints = await getTeamPoints(tournament, team);
  const projectedPoints = currentTeamPoints + pickCost;
  const picksAfterThis = team.pickLog.length + 1;
  const minPicksRequired = Math.max(tierList.draftCount.min, picksAfterThis);
  const pickCeiling = maxPoints + picksAfterThis - minPicksRequired;

  return projectedPoints <= pickCeiling;
}

export async function canBeDrafted(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPickEntity,
): Promise<boolean> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") return false;

  const tierList = tournament.tierList;
  if (!areAddonsValid(tierList, pick)) {
    return false;
  }

  return (
    !isAlreadyDrafted(draft, pick.pokemonId) &&
    (await teamHasEnoughPoints(tournament, draft, team, pick))
  );
}

export async function canBeDraftedWithReason(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPickEntity,
): Promise<{ canDraft: boolean; reason?: string }> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") {
    return { canDraft: false, reason: "Invalid Pokemon ID" };
  }

  const tierList = tournament.tierList;
  if (!areAddonsValid(tierList, pick)) {
    return {
      canDraft: false,
      reason: "Invalid addon selection for this Pokemon",
    };
  }

  if (isAlreadyDrafted(draft, pick.pokemonId)) {
    return {
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    };
  }

  if (!(await teamHasEnoughPoints(tournament, draft, team, pick))) {
    return {
      canDraft: false,
      reason: "Team does not have enough points to draft this Pokemon",
    };
  }

  return { canDraft: true };
}

export async function isTeamDoneDrafting(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
): Promise<boolean> {
  const tierList = tournament.tierList;
  if (team.pickLog.length >= tierList.draftCount.max) return true;

  const teamPoints = await getTeamPoints(tournament, team);
  if (tierList.pointTotal !== undefined && teamPoints >= tierList.pointTotal)
    return true;

  const picksRemaining = tierList.draftCount.max - team.pickLog.length;
  if (picksRemaining <= 0) return true;

  if (tierList.pointTotal !== undefined) {
    const pointsRemaining = tierList.pointTotal - teamPoints;
    if (pointsRemaining < 1) return true;
  }

  return false;
}

export function isDraftComplete(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
): boolean {
  const tierList = tournament.tierList;
  const totalPicksNeeded = draft.teams.length * tierList.draftCount.max;

  if (draft.counter >= totalPicksNeeded) return true;

  const allTeamsDone = draft.teams.every(
    (team: PopulatedTeam) => team.pickLog.length >= tierList.draftCount.max,
  );

  return allTeamsDone;
}
