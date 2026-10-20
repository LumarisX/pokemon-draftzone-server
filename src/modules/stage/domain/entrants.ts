export type EntrantKind = "team" | "place" | "open";

export interface EntrantInput {
  kind: EntrantKind;
  teamId?: string;
  sourceStageKey?: string;
  place?: number;
}

export interface ResolvedEntrant {
  kind: EntrantKind;
  team: string | null;
  sourceStage: string | null;
  place: number | null;
}

interface StoredEntrantLike {
  kind: string;
  team?: { toString(): string } | null;
  sourceStage?: { toString(): string } | null;
  place?: number | null;
}

export function seedTeamsOf(stage: {
  entrants?: StoredEntrantLike[];
  teamIds?: { toString(): string }[];
}): (string | null)[] {
  if (stage.entrants?.length)
    return stage.entrants.map((entrant) => entrant.team?.toString() ?? null);
  return (stage.teamIds ?? []).map((id) => id.toString());
}

export function validateEntrants(
  stageKey: string,
  stageName: string,
  entrants: EntrantInput[],
  stageKeys: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const teams = new Set<string>();
  const places = new Set<string>();

  entrants.forEach((entrant, index) => {
    const seed = index + 1;
    if (entrant.kind === "team") {
      if (!entrant.teamId) {
        errors.push(`Seed ${seed} of ${stageName} is a team with no team set`);
        return;
      }
      if (teams.has(entrant.teamId))
        errors.push(`A team enters ${stageName} more than once`);
      teams.add(entrant.teamId);
      return;
    }
    if (entrant.kind === "place") {
      if (!entrant.sourceStageKey || !entrant.place) {
        errors.push(`Seed ${seed} of ${stageName} needs a stage and a place`);
        return;
      }
      if (entrant.sourceStageKey === stageKey) {
        errors.push(`Seed ${seed} of ${stageName} comes from its own standings`);
        return;
      }
      if (!stageKeys.has(entrant.sourceStageKey)) {
        errors.push(`Seed ${seed} of ${stageName} comes from a missing stage`);
        return;
      }
      const key = `${entrant.sourceStageKey}:${entrant.place}`;
      if (places.has(key))
        errors.push(`${stageName} takes the same place twice`);
      places.add(key);
    }
  });

  return errors;
}

export function carryConfirmedTeams(
  next: ResolvedEntrant[],
  previous: StoredEntrantLike[],
): ResolvedEntrant[] {
  const confirmedPlace = new Map<string, string>();
  for (const entrant of previous) {
    if (entrant.kind !== "place" || !entrant.team) continue;
    confirmedPlace.set(
      `${entrant.sourceStage?.toString()}:${entrant.place}`,
      entrant.team.toString(),
    );
  }

  return next.map((entrant, index) => {
    if (entrant.kind === "place")
      return {
        ...entrant,
        team:
          confirmedPlace.get(`${entrant.sourceStage}:${entrant.place}`) ??
          null,
      };
    if (entrant.kind === "open") {
      const before = previous[index];
      return {
        ...entrant,
        team: before?.kind === "open" ? (before.team?.toString() ?? null) : null,
      };
    }
    return entrant;
  });
}

export function changedPlayedSeeds(
  previous: (string | null)[],
  next: (string | null)[],
  playedSeeds: ReadonlySet<number>,
): number[] {
  return [...playedSeeds]
    .filter((seed) => (previous[seed - 1] ?? null) !== (next[seed - 1] ?? null))
    .sort((a, b) => a - b);
}
