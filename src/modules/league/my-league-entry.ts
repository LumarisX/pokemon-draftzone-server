import { StandingResult } from "@modules/stage/domain/standings";

export type FormResult = "win" | "loss" | "draw";

export type NextMatch = {
  round: string;
  matchupSlug: string;
  when: string | null;
  exactTime: boolean;
  opponent: {
    name: string;
    coach: string | null;
    logo: string | null;
    teamSlug: string | null;
  } | null;
};

export type EntryMatchup = {
  slug: string;
  round?: { equals(other: unknown): boolean } | null;
  winner?: string | null;
  scheduledDate?: Date | null;
  side1: { team?: EntryTeam | null };
  side2: { team?: EntryTeam | null };
};

export type EntryTeam = {
  _id: { toString(): string };
  teamName: string;
  slug: string;
  logo?: string;
  primaryCoach?: { name?: string } | null;
};

export type EntryRound = {
  _id: { toString(): string };
  name: string;
  matchDeadline?: Date | null;
};

const FORM_LENGTH = 5;
const SCORING_GRACE_MS = 24 * 60 * 60 * 1000;

export function formFrom(results: StandingResult[]): FormResult[] {
  return results
    .flatMap((result): FormResult[] => {
      if (!result || result.outcome === "t") return [];
      if (result.outcome === "w") return ["win"];
      if (result.outcome === "d") return ["draw"];
      return ["loss"];
    })
    .slice(-FORM_LENGTH);
}

export function nextMatchFor(
  matchups: EntryMatchup[],
  teamId: string,
  rounds: EntryRound[],
  now = Date.now(),
): NextMatch | null {
  const roundIndex = (matchup: EntryMatchup) =>
    rounds.findIndex((round) => matchup.round?.equals(round._id));

  const mine = matchups
    .filter((matchup) => !matchup.winner)
    .flatMap((matchup) => {
      const side = (["side1", "side2"] as const).find(
        (candidate) => matchup[candidate].team?._id.toString() === teamId,
      );
      if (!side) return [];
      const opponent = matchup[side === "side1" ? "side2" : "side1"].team;
      return [{ matchup, opponent: opponent ?? null }];
    });

  const scheduled = mine
    .filter(
      ({ matchup }) =>
        matchup.scheduledDate &&
        matchup.scheduledDate.getTime() > now - SCORING_GRACE_MS,
    )
    .sort(
      (a, b) =>
        a.matchup.scheduledDate!.getTime() - b.matchup.scheduledDate!.getTime(),
    );
  const pick =
    scheduled[0] ??
    mine
      .filter(({ matchup }) => !matchup.scheduledDate)
      .sort((a, b) => roundIndex(a.matchup) - roundIndex(b.matchup))[0];
  if (!pick) return null;

  const round = rounds[roundIndex(pick.matchup)];
  const when = pick.matchup.scheduledDate ?? round?.matchDeadline ?? null;
  return {
    round: round?.name ?? "Next Match",
    matchupSlug: pick.matchup.slug,
    when: when ? when.toISOString() : null,
    exactTime: !!pick.matchup.scheduledDate,
    opponent: pick.opponent
      ? {
          name: pick.opponent.teamName,
          coach: pick.opponent.primaryCoach?.name ?? null,
          logo: pick.opponent.logo ?? null,
          teamSlug: pick.opponent.slug,
        }
      : null,
  };
}
