export type LeagueRole = "owner" | "admin";

type LeagueMembers = {
  owner: string;
  admins?: readonly { sub: string; name: string }[];
};

export function leagueRole(
  league: LeagueMembers,
  sub: string | undefined,
): LeagueRole | null {
  if (!sub) return null;
  if (league.owner === sub) return "owner";
  return league.admins?.some((admin) => admin.sub === sub) ? "admin" : null;
}

export function adminName(
  league: LeagueMembers,
  sub: string,
): string | null {
  return league.admins?.find((admin) => admin.sub === sub)?.name ?? null;
}
