import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";

export const TOURNAMENT_ACTIONS = [
  "viewHidden",
  "viewStaff",
  "manageSettings",
  "manageParticipants",
  "manageDrafts",
  "manageSchedule",
  "manageResults",
  "manageTrades",
  "moderateChat",
  "manageStaff",
] as const;

export type TournamentAction = (typeof TOURNAMENT_ACTIONS)[number];

export const TOURNAMENT_ROLES = ["owner", "organizer"] as const;

export type TournamentRole = (typeof TOURNAMENT_ROLES)[number];

export const ROLE_ACTIONS: Record<TournamentRole, readonly TournamentAction[]> =
  {
    owner: TOURNAMENT_ACTIONS,
    organizer: TOURNAMENT_ACTIONS.filter((action) => action !== "manageStaff"),
  };

export interface TournamentStaff {
  owner: string;
  organizers: readonly string[];
}

export function rolesOf(
  tournament: TournamentStaff,
  sub: string | undefined,
): TournamentRole[] {
  if (!sub) return [];
  const roles: TournamentRole[] = [];
  if (tournament.owner === sub) roles.push("owner");
  if (tournament.owner === sub || tournament.organizers.includes(sub))
    roles.push("organizer");
  return roles;
}

export function isStaff(
  tournament: TournamentStaff,
  sub: string | undefined,
): boolean {
  return rolesOf(tournament, sub).length > 0;
}

export function can(
  tournament: TournamentStaff,
  sub: string | undefined,
  action: TournamentAction,
): boolean {
  return rolesOf(tournament, sub).some((role) =>
    ROLE_ACTIONS[role].includes(action),
  );
}

export function assertCan(
  tournament: TournamentStaff,
  sub: string | undefined,
  action: TournamentAction,
): void {
  if (!can(tournament, sub, action))
    throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
}
