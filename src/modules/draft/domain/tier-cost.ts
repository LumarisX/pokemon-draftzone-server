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
  const maxPoints = tournament.pointTotal;
  // `null` (explicitly cleared by an organizer) means "no cap", same as
  // `undefined` (never set) - only a real number is an enforceable budget.
  if (maxPoints == null) return true;

  const currentTeamPoints = await getTeamPoints(tournament, team);
  const projectedPoints = currentTeamPoints + pickCost;
  const picksAfterThis = team.pickLog.length + 1;
  const minPicksRequired = Math.max(tournament.draftCount.min, picksAfterThis);
  const remainingRequired = minPicksRequired - picksAfterThis;
  // Reserve 1 point per remaining required pick as a cheap safety margin —
  // but never more than the tier list can actually charge. A tier list
  // where every tier costs 0 (a free/BST-cap format) has nothing to
  // reserve, so don't manufacture a budget deficit out of it.
  const cheapestTierCost = tierList.tiers.length
    ? Math.min(...tierList.tiers.map((tier) => tier.cost))
    : 1;
  const reservePerPick = Math.min(1, cheapestTierCost);
  const pickCeiling = maxPoints - remainingRequired * reservePerPick;

  return projectedPoints <= pickCeiling;
}

function countPicksByTier(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
): Map<string, number> {
  const tierList = tournament.tierList;
  const counts = new Map<string, number>();
  for (const draftPick of team.pickLog) {
    const pokemonId = getPokemonIdFromDraft(draftPick);
    const tierName = tierList.pokemon.get(pokemonId)?.tier;
    if (!tierName) continue;
    counts.set(tierName, (counts.get(tierName) ?? 0) + 1);
  }
  return counts;
}

function tierRequirementsAreFeasible(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
  pick: { pokemonId: string },
): boolean {
  const requirements = tournament.tierRequirements;
  if (!requirements?.length) return true;

  const picksByTier = countPicksByTier(tournament, team);
  const pickedTier = tournament.tierList.pokemon.get(pick.pokemonId)?.tier;
  if (pickedTier) {
    picksByTier.set(pickedTier, (picksByTier.get(pickedTier) ?? 0) + 1);
  }

  const picksAfterThis = team.pickLog.length + 1;
  const slotsRemaining = tournament.draftCount.max - picksAfterThis;

  const totalShortfall = requirements.reduce((sum, req) => {
    const have = picksByTier.get(req.tierName) ?? 0;
    return sum + Math.max(0, req.required - have);
  }, 0);

  return totalShortfall <= slotsRemaining;
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

  const alreadyTaken =
    draft.sequentialTurns !== false && isAlreadyDrafted(draft, pick.pokemonId);

  return (
    !alreadyTaken &&
    tierRequirementsAreFeasible(tournament, team, pick) &&
    (await teamHasEnoughPoints(tournament, draft, team, pick))
  );
}

export type DraftEligibilityOptions = {
  /**
   * Skips the point budget and tier-requirement feasibility checks. Those are
   * the rules an organizer is correcting when they edit a roster by hand, so
   * only their edits set this — the checks that keep the draft coherent (real
   * Pokemon, valid addons, not already taken) still apply.
   */
  ignoreLimits?: boolean;
};

export async function canBeDraftedWithReason(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPickEntity,
  options: DraftEligibilityOptions = {},
): Promise<{ canDraft: boolean; reason?: string }> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") {
    return { canDraft: false, reason: "Invalid Pokemon ID" };
  }

  const tierList = tournament.tierList;
  if (!tierList.pokemon.has(pick.pokemonId)) {
    return { canDraft: false, reason: "Pokemon is not on this tier list" };
  }

  if (!areAddonsValid(tierList, pick)) {
    return {
      canDraft: false,
      reason: "Invalid addon selection for this Pokemon",
    };
  }

  if (
    draft.sequentialTurns !== false &&
    isAlreadyDrafted(draft, pick.pokemonId)
  ) {
    return {
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    };
  }

  if (options.ignoreLimits) return { canDraft: true };

  if (!tierRequirementsAreFeasible(tournament, team, pick)) {
    return {
      canDraft: false,
      reason:
        "Drafting this Pokemon would make it impossible to meet tier requirements",
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
  if (team.pickLog.length >= tournament.draftCount.max) return true;

  const picksRemaining = tournament.draftCount.max - team.pickLog.length;
  if (picksRemaining <= 0) return true;

  if (tournament.pointTotal != null) {
    const teamPoints = await getTeamPoints(tournament, team);
    const pointsRemaining = tournament.pointTotal - teamPoints;
    // A team is only out of picks once it can no longer afford even the
    // cheapest tier — not just once it has spent its whole (possibly 0)
    // budget, since an all-zero-cost tier list has nothing to exhaust.
    const tierList = tournament.tierList;
    const cheapestTierCost = tierList.tiers.length
      ? Math.min(...tierList.tiers.map((tier) => tier.cost))
      : 0;
    if (pointsRemaining < cheapestTierCost) return true;
  }

  return false;
}

export async function isTeamRosterValid(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
): Promise<boolean> {
  const pickCount = team.pickLog.length;
  if (pickCount < tournament.draftCount.min) return false;
  if (pickCount > tournament.draftCount.max) return false;

  if (tournament.pointTotal != null) {
    const teamPoints = await getTeamPoints(tournament, team);
    if (teamPoints > tournament.pointTotal) return false;
  }

  const requirements = tournament.tierRequirements;
  if (requirements?.length) {
    const picksByTier = countPicksByTier(tournament, team);
    const meetsAll = requirements.every(
      (req) => (picksByTier.get(req.tierName) ?? 0) >= req.required,
    );
    if (!meetsAll) return false;
  }

  return true;
}

export function isDraftComplete(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
): boolean {
  if (!tournament.draftCount.max) return false;

  if (draft.sequentialTurns) {
    const totalPicksNeeded = draft.teams.length * tournament.draftCount.max;
    if (draft.counter >= totalPicksNeeded) return true;
  }

  const allTeamsDone = draft.teams.every(
    (team: PopulatedTeam) => team.pickLog.length >= tournament.draftCount.max,
  );

  return allTeamsDone;
}
