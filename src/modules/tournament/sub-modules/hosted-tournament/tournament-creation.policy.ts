import { UserRole } from "@modules/user/user.schema";

export const TOURNAMENT_CREATION_MODES = ["beta", "open"] as const;

export type TournamentCreationMode = (typeof TOURNAMENT_CREATION_MODES)[number];

export const DEFAULT_MAX_ACTIVE_TOURNAMENTS = 3;

export type TournamentCreationBlock = "restricted" | "limit";

export type TournamentCreationDecision =
  | { allowed: true }
  | { allowed: false; reason: TournamentCreationBlock };

export function tournamentCreationMode(
  value: string | undefined,
): TournamentCreationMode {
  return value === "open" ? "open" : "beta";
}

export function maxActiveTournaments(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_ACTIVE_TOURNAMENTS;
}

function isSiteStaff(roles: readonly UserRole[]): boolean {
  return roles.includes(UserRole.ADMIN) || roles.includes(UserRole.OWNER);
}

export function mayHost(
  mode: TournamentCreationMode,
  roles: readonly UserRole[],
): boolean {
  return (
    isSiteStaff(roles) ||
    mode === "open" ||
    roles.includes(UserRole.TOURNAMENT_CREATOR)
  );
}

export function decideTournamentCreation(input: {
  mode: TournamentCreationMode;
  roles: readonly UserRole[];
  activeCount: number;
  maxActive: number;
}): TournamentCreationDecision {
  if (isSiteStaff(input.roles)) return { allowed: true };
  if (!mayHost(input.mode, input.roles))
    return { allowed: false, reason: "restricted" };
  if (input.activeCount >= input.maxActive)
    return { allowed: false, reason: "limit" };
  return { allowed: true };
}
