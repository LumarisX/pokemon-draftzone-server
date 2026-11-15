import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { TeamPickEntity } from "@modules/team/team.schema";
import { TierList } from "@modules/tier-list/tier-list.domain";
import { getPokemonIdFromDraft, isAlreadyDrafted } from "./pick-order";
import { duplicatesAllowed } from "./pick-visibility";

export function enforceableTierRequirements(
  tournament: PopulatedTournament,
): { tierId: string; required: number }[] {
  const tierList = tournament.tierList;
  return (tournament.tierRequirements ?? []).filter((requirement) =>
    Boolean(tierList.getTierById(requirement.tierId)),
  );
}

export function createPokemonTierMap(
  tournament: PopulatedTournament,
): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = tournament.tierList;
  Array.from(tierList.pokemon.entries()).forEach(([pokemonId, data]) => {
    const tierName = tierList.getTierById(data.tierId)?.name;
    if (tierName) tierMap.set(pokemonId, tierName);
  });
  return tierMap;
}

function getBaseTierCost(tierList: TierList, pokemonId: string): number {
  const pokemonData = tierList.pokemon.get(pokemonId);
  if (!pokemonData) {
    return 0;
  }
  return tierList.getTierById(pokemonData.tierId)?.cost || 0;
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

function sumTeamPoints(tierList: TierList, team: PopulatedTeam): number {
  return team.pickLog.reduce(
    (total, draftPick) =>
      total +
      getPickCost(tierList, {
        pokemonId: getPokemonIdFromDraft(draftPick),
        addons: draftPick.addons,
      }),
    0,
  );
}

export async function getTeamPoints(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
) {
  return sumTeamPoints(tournament.tierList, team);
}

function fitsBudget(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
  teamPoints: number,
  pickCost: number,
): boolean {
  const maxPoints = tournament.pointTotal;
  if (maxPoints == null) return true;

  const tierList = tournament.tierList;
  const picksAfterThis = team.pickLog.length + 1;
  const minPicksRequired = Math.max(tournament.draftCount.min, picksAfterThis);
  const remainingRequired = minPicksRequired - picksAfterThis;
  const cheapestTierCost = tierList.tiers.length
    ? Math.min(...tierList.tiers.map((tier) => tier.cost))
    : 1;
  const reservePerPick = Math.min(1, cheapestTierCost);
  const pickCeiling = maxPoints - remainingRequired * reservePerPick;

  return teamPoints + pickCost <= pickCeiling;
}

export async function teamHasEnoughPoints(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPickEntity,
): Promise<boolean> {
  const tierList = tournament.tierList;
  if (!tierList.pokemon.has(pick.pokemonId)) return false;
  return fitsBudget(
    tournament,
    team,
    sumTeamPoints(tierList, team),
    getPickCost(tierList, pick),
  );
}

function countPicksByTier(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
): Map<string, number> {
  const tierList = tournament.tierList;
  const counts = new Map<string, number>();
  for (const draftPick of team.pickLog) {
    const pokemonId = getPokemonIdFromDraft(draftPick);
    const tierId = tierList.pokemon.get(pokemonId)?.tierId;
    if (!tierId) continue;
    counts.set(tierId, (counts.get(tierId) ?? 0) + 1);
  }
  return counts;
}

function tierRequirementsAreFeasible(
  tournament: PopulatedTournament,
  team: PopulatedTeam,
  pick: { pokemonId: string },
): boolean {
  const requirements = enforceableTierRequirements(tournament);
  if (!requirements.length) return true;

  const picksByTier = countPicksByTier(tournament, team);
  const pickedTier = tournament.tierList.pokemon.get(pick.pokemonId)?.tierId;
  if (pickedTier) {
    picksByTier.set(pickedTier, (picksByTier.get(pickedTier) ?? 0) + 1);
  }

  const picksAfterThis = team.pickLog.length + 1;
  const slotsRemaining = tournament.draftCount.max - picksAfterThis;

  const totalShortfall = requirements.reduce((sum, req) => {
    const have = picksByTier.get(req.tierId) ?? 0;
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

  return (
    !takenReason(draft, team, pick.pokemonId) &&
    tierRequirementsAreFeasible(tournament, team, pick) &&
    (await teamHasEnoughPoints(tournament, draft, team, pick))
  );
}

function takenReason(
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pokemonId: string,
): string | null {
  if (team.pickLog.some((pick) => getPokemonIdFromDraft(pick) === pokemonId))
    return "This team has already drafted this Pokemon";
  if (!duplicatesAllowed(draft) && isAlreadyDrafted(draft, pokemonId))
    return "Pokemon has already been drafted by another team";
  return null;
}

export type DraftEligibilityOptions = {
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

  const taken = takenReason(draft, team, pick.pokemonId);
  if (taken) return { canDraft: false, reason: taken };

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

export function isActiveTeam(team: PopulatedTeam): boolean {
  return !team.status || team.status === "approved";
}

export function canStillPick(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
): boolean {
  if (!isActiveTeam(team)) return false;
  if (team.pickLog.length >= tournament.draftCount.max) return false;

  const tierList = tournament.tierList;
  const owned = new Set(team.pickLog.map(getPokemonIdFromDraft));
  const taken = duplicatesAllowed(draft)
    ? owned
    : new Set(
        draft.teams.flatMap((other) =>
          other.pickLog.map(getPokemonIdFromDraft),
        ),
      );
  const teamPoints = sumTeamPoints(tierList, team);

  for (const [pokemonId, entry] of tierList.pokemon) {
    if (entry.banned || !entry.tierId) continue;
    if (owned.has(pokemonId) || taken.has(pokemonId)) continue;
    if (
      !fitsBudget(
        tournament,
        team,
        teamPoints,
        getPickCost(tierList, { pokemonId }),
      )
    )
      continue;
    if (!tierRequirementsAreFeasible(tournament, team, { pokemonId })) continue;
    return true;
  }
  return false;
}

export function isTeamDoneDrafting(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  team: PopulatedTeam,
): boolean {
  return !canStillPick(tournament, draft, team);
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

  const requirements = enforceableTierRequirements(tournament);
  if (requirements.length) {
    const picksByTier = countPicksByTier(tournament, team);
    const meetsAll = requirements.every(
      (req) => (picksByTier.get(req.tierId) ?? 0) >= req.required,
    );
    if (!meetsAll) return false;
  }

  return true;
}

export function isDraftComplete(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
): boolean {
  if (!tournament.draftCount.max || !draft.teams.length) return false;
  return draft.teams.every((team) => isTeamDoneDrafting(tournament, draft, team));
}

export function owedPicks(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
): { team: PopulatedTeam; count: number }[] {
  return draft.teams
    .filter((team) => canStillPick(tournament, draft, team))
    .map((team) => ({
      team,
      count: tournament.draftCount.max - team.pickLog.length,
    }));
}
