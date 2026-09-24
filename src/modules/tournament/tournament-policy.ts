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

export const STAFF_ROLES = ["organizer"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const TOURNAMENT_ROLES = ["owner", ...STAFF_ROLES] as const;

export type TournamentRole = (typeof TOURNAMENT_ROLES)[number];

export const ROLE_ACTIONS: Record<TournamentRole, readonly TournamentAction[]> =
  {
    owner: TOURNAMENT_ACTIONS,
    organizer: TOURNAMENT_ACTIONS.filter((action) => action !== "manageStaff"),
  };

export interface StaffMember {
  sub: string;
  name?: string;
  role: StaffRole;
}

export interface TournamentStaff {
  owner: string;
  staff: readonly StaffMember[];
}

export function rolesOf(
  tournament: TournamentStaff,
  sub: string | undefined,
): TournamentRole[] {
  if (!sub) return [];
  const roles = new Set<TournamentRole>();
  if (tournament.owner === sub) {
    roles.add("owner");
    roles.add("organizer");
  }
  for (const member of tournament.staff)
    if (member.sub === sub) roles.add(member.role);
  return [...roles];
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
