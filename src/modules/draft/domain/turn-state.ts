import {
  PopulatedDraft,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import {
  calculateCanDraft,
  calculateCanDraftCounts,
  calculateCurrentPick,
  generatePickOrder,
  getDocumentId,
  getDraftOrder,
  turnsRemain,
} from "./pick-order";
import { canStillPick } from "./tier-cost";

export function isWaitingOnOwedPicks(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
): boolean {
  return (
    draft.status === "IN_PROGRESS" &&
    draft.sequentialTurns &&
    draft.teams.length > 0 &&
    !turnsRemain(draft, tournament.draftCount.max)
  );
}

export function turnState(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
) {
  const pickOrder = generatePickOrder(
    getDraftOrder(draft),
    tournament.draftCount.max,
    draft.orderProgression,
  );
  const teamsById = new Map(
    draft.teams.map((team) => [getDocumentId(team), team]),
  );
  const able = (teamId: string) => {
    const team = teamsById.get(teamId);
    return !!team && canStillPick(tournament, draft, team);
  };

  return {
    canDraftTeams: calculateCanDraft(draft, pickOrder).filter(able),
    canDraftCounts: Object.fromEntries(
      Object.entries(calculateCanDraftCounts(draft, pickOrder)).filter(
        ([teamId]) => able(teamId),
      ),
    ),
    currentPick: calculateCurrentPick(draft),
  };
}
