import { advancingSides, AdvancementMatchup } from "./advancement";

export type TeamOutcome = {
  placement: number;
  of: number;
  label: string | null;
  champion: boolean;
};

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];

function teamOn(matchup: AdvancementMatchup, side: Side): string | null {
  return matchup[side].team ?? null;
}

function sourceIds(matchup: AdvancementMatchup): string[] {
  return SIDES.flatMap((side) => {
    const slot = matchup[side].slot;
    return slot?.matchId && (slot.type === "winner" || slot.type === "loser")
      ? [slot.matchId]
      : [];
  });
}

function isLoserFed(matchup: AdvancementMatchup): boolean {
  return SIDES.every((side) => matchup[side].slot?.type === "loser");
}

function isDecided(matchup: AdvancementMatchup): boolean {
  return advancingSides(matchup).winner !== null;
}

function resetSource(
  matchup: AdvancementMatchup,
  byId: Map<string, AdvancementMatchup>,
): AdvancementMatchup | null {
  const [first, second] = SIDES.map((side) => matchup[side].slot);
  if (!first?.matchId || first.matchId !== second?.matchId) return null;
  const types = new Set([first.type, second.type]);
  if (!types.has("winner") || !types.has("loser")) return null;
  return byId.get(first.matchId) ?? null;
}

function findFinal(
  matchups: AdvancementMatchup[],
): AdvancementMatchup | undefined {
  const feeding = new Set(matchups.flatMap(sourceIds));
  const terminal = matchups.filter(
    (matchup) => !feeding.has(matchup.id) && !isLoserFed(matchup),
  );
  const depthOf = new Map<string, number>();
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const chain = (matchup: AdvancementMatchup, seen: Set<string>): number => {
    if (depthOf.has(matchup.id)) return depthOf.get(matchup.id)!;
    if (seen.has(matchup.id)) return 0;
    seen.add(matchup.id);
    const longest = Math.max(
      0,
      ...sourceIds(matchup)
        .map((id) => byId.get(id))
        .filter((source): source is AdvancementMatchup => !!source)
        .map((source) => chain(source, seen) + 1),
    );
    depthOf.set(matchup.id, longest);
    return longest;
  };
  const final = terminal.sort(
    (a, b) => chain(b, new Set()) - chain(a, new Set()),
  )[0];
  if (!final || isDecided(final)) return final;

  const reset = resetSource(final, byId);
  return reset && isDecided(reset) && advancingSides(reset).winner === "side1"
    ? reset
    : final;
}

function depthsFrom(
  final: AdvancementMatchup,
  matchups: AdvancementMatchup[],
): Map<string, number> {
  const byId = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const depths = new Map<string, number>([[final.id, 0]]);
  const queue = [final];
  while (queue.length) {
    const current = queue.shift()!;
    const depth = depths.get(current.id)!;
    for (const id of sourceIds(current)) {
      const source = byId.get(id);
      if (!source || depths.has(id)) continue;
      depths.set(id, depth + 1);
      queue.push(source);
    }
  }
  return depths;
}

type Tiered = { teamId: string; tier: number };

const UNFINISHED_TIER = 1000;

function bracketTiers(matchups: AdvancementMatchup[]): {
  tiers: Tiered[];
  championId: string | null;
} {
  const final = findFinal(matchups);
  if (!final) return { tiers: [], championId: null };

  const active = matchups.filter(
    (matchup) => matchup.id === final.id || !resetOf(matchup, final),
  );
  const depths = depthsFrom(final, active);
  const feeding = new Set(active.flatMap(sourceIds));
  const consumedLosers = new Set(
    active.flatMap((matchup) =>
      SIDES.flatMap((side) => {
        const slot = matchup[side].slot;
        return slot?.type === "loser" && slot.matchId ? [slot.matchId] : [];
      }),
    ),
  );
  const thirdPlace = active.find(
    (matchup) =>
      matchup.id !== final.id &&
      isLoserFed(matchup) &&
      !feeding.has(matchup.id),
  );

  const finalExit = advancingSides(final);
  const championId = finalExit.winner ? teamOn(final, finalExit.winner) : null;
  const runnerUpId = finalExit.loser ? teamOn(final, finalExit.loser) : null;

  const thirdExit = thirdPlace ? advancingSides(thirdPlace) : null;
  const thirdId =
    thirdPlace && thirdExit?.winner ? teamOn(thirdPlace, thirdExit.winner) : null;
  const fourthId =
    thirdPlace && thirdExit?.loser ? teamOn(thirdPlace, thirdExit.loser) : null;

  const teams = new Set(
    active.flatMap((matchup) =>
      SIDES.flatMap((side) => {
        const team = teamOn(matchup, side);
        return team ? [team] : [];
      }),
    ),
  );

  const finalists = new Set(
    SIDES.flatMap((side) => {
      const team = teamOn(final, side);
      return team ? [team] : [];
    }),
  );

  const fixedTier = new Map<string, number>();
  if (championId) fixedTier.set(championId, 0);
  else for (const teamId of finalists) fixedTier.set(teamId, 1);
  if (runnerUpId) fixedTier.set(runnerUpId, 1);
  if (thirdId) fixedTier.set(thirdId, 2);
  if (fourthId) fixedTier.set(fourthId, 3);

  const tiers: Tiered[] = [];
  for (const teamId of teams) {
    const fixed = fixedTier.get(teamId);
    if (fixed !== undefined) {
      tiers.push({ teamId, tier: fixed });
      continue;
    }

    let eliminatedAt: number | null = null;
    for (const matchup of active) {
      if (consumedLosers.has(matchup.id)) continue;
      const exit = advancingSides(matchup);
      if (!exit.loser || teamOn(matchup, exit.loser) !== teamId) continue;
      const depth = depths.get(matchup.id);
      if (depth === undefined) continue;
      eliminatedAt =
        eliminatedAt === null ? depth : Math.min(eliminatedAt, depth);
    }

    tiers.push({
      teamId,
      tier: eliminatedAt === null ? UNFINISHED_TIER : 10 + eliminatedAt,
    });
  }
  return { tiers, championId };
}

function resetOf(
  matchup: AdvancementMatchup,
  final: AdvancementMatchup,
): boolean {
  return SIDES.some((side) => matchup[side].slot?.matchId === final.id);
}

export function computeOutcomes(input: {
  standingsOrder: string[];
  bracketMatchups: AdvancementMatchup[];
}): Map<string, TeamOutcome> {
  const rank = new Map(
    input.standingsOrder.map((teamId, index) => [teamId, index]),
  );
  const byRank = (a: string, b: string) =>
    (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (rank.get(b) ?? Number.MAX_SAFE_INTEGER);

  const { tiers, championId } = bracketTiers(input.bracketMatchups);
  const inBracket = new Set(tiers.map((entry) => entry.teamId));

  const ordered = [
    ...[...tiers]
      .sort((a, b) => a.tier - b.tier || byRank(a.teamId, b.teamId))
      .map((entry) => entry.teamId),
    ...input.standingsOrder.filter((teamId) => !inBracket.has(teamId)),
  ];

  const outcomes = new Map<string, TeamOutcome>();
  ordered.forEach((teamId, index) => {
    const champion = tiers.length ? teamId === championId : index === 0;
    outcomes.set(teamId, {
      placement: index + 1,
      of: ordered.length,
      label: champion ? "Champion" : null,
      champion,
    });
  });
  return outcomes;
}
