import { PopulatedTeam } from "@modules/team/team.repository";
import { canOnTeam } from "@modules/tournament/membership";
import { can, TournamentStaff } from "@modules/tournament/tournament-policy";

export const PICKS_VISIBLE_TO = ["everyone", "ownTeam"] as const;

export type PicksVisibleTo = (typeof PICKS_VISIBLE_TO)[number];

type VisibilityDraft = {
  picksVisibleTo?: PicksVisibleTo;
  status?: string;
};

export function picksAreBlind(draft: VisibilityDraft): boolean {
  return draft.picksVisibleTo === "ownTeam" && draft.status !== "COMPLETED";
}

export function canSeeAllPicks(
  tournament: TournamentStaff,
  draft: VisibilityDraft,
  sub: string | undefined,
): boolean {
  return !picksAreBlind(draft) || can(tournament, sub, "manageDrafts");
}

export function canSeeTeamPicks(
  tournament: TournamentStaff,
  draft: VisibilityDraft,
  team: PopulatedTeam,
  sub: string | undefined,
): boolean {
  return (
    canSeeAllPicks(tournament, draft, sub) || canOnTeam(team, sub, "draft")
  );
}

export function duplicatesAllowed(draft: { allowDuplicates?: boolean }) {
  return draft.allowDuplicates === true;
}
