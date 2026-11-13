import { SeasonPhase } from "./my-league-entry";

export type DirectoryStatus =
  | "signups"
  | "drafting"
  | "season"
  | "upcoming"
  | "between";

export type DirectoryTournament = {
  name: string;
  tournamentSlug: string;
  format: string | null;
  ruleset: string | null;
  status: DirectoryStatus;
  signUpDeadline: Date | null;
  draftStart: Date | null;
};

export type DirectoryLeague = {
  name: string;
  leagueSlug: string;
  description: string | null;
  logo: string | null;
  status: DirectoryStatus;
  tournaments: DirectoryTournament[];
};

const STATUS_ORDER: DirectoryStatus[] = [
  "signups",
  "drafting",
  "season",
  "upcoming",
  "between",
];

export function directoryStatus(
  phase: SeasonPhase,
  signUpDeadline: Date | null | undefined,
  now = Date.now(),
): DirectoryStatus {
  if (phase === "completed") return "between";
  if (phase === "upcoming" && signUpDeadline && signUpDeadline.getTime() > now)
    return "signups";
  return phase;
}

export function leagueStatus(tournaments: DirectoryTournament[]): DirectoryStatus {
  return tournaments.reduce<DirectoryStatus>(
    (best, tournament) =>
      STATUS_ORDER.indexOf(tournament.status) < STATUS_ORDER.indexOf(best)
        ? tournament.status
        : best,
    "between",
  );
}

export function orderDirectory(leagues: DirectoryLeague[]): DirectoryLeague[] {
  return [...leagues].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.name.localeCompare(b.name),
  );
}
