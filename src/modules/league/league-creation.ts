import { UserRole } from "@modules/user/user.schema";

export const LEAGUE_CREATION_MODES = ["beta", "open"] as const;

export type LeagueCreationMode = (typeof LEAGUE_CREATION_MODES)[number];

export const DEFAULT_MAX_OWNED_LEAGUES = 3;

export type LeagueCreationBlock = "restricted" | "limit";

export type LeagueCreationDecision =
  | { allowed: true }
  | { allowed: false; reason: LeagueCreationBlock };

export function leagueCreationMode(value: string | undefined): LeagueCreationMode {
  return value === "open" ? "open" : "beta";
}

export function maxOwnedLeagues(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_OWNED_LEAGUES;
}

function isSiteStaff(roles: readonly UserRole[]): boolean {
  return roles.includes(UserRole.ADMIN) || roles.includes(UserRole.OWNER);
}

export function decideLeagueCreation(input: {
  mode: LeagueCreationMode;
  roles: readonly UserRole[];
  ownedCount: number;
  maxOwned: number;
}): LeagueCreationDecision {
  if (isSiteStaff(input.roles)) return { allowed: true };
  if (input.mode === "beta" && !input.roles.includes(UserRole.LEAGUE_CREATOR))
    return { allowed: false, reason: "restricted" };
  if (input.ownedCount >= input.maxOwned)
    return { allowed: false, reason: "limit" };
  return { allowed: true };
}
