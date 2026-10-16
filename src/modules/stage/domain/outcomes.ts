import { advancingSides, AdvancementMatchup } from "./advancement";

export type TeamOutcome = {
  placement: number;
  of: number;
  label: string | null;
  champion: boolean;
};

type Side = "side1" | "side2";
const SIDES: readonly Side[] = ["side1", "side2"];

const DEPTH_LABELS = ["Runner-Up", "Semifinalist", "Quarterfinalist"];

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
  return terminal.sort(
    (a, b) => chain(b, new Set()) - chain(a, new Set()),
  )[0];
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

type Tiered = { teamId: string; tier: number; label: string | null };

function bracketTiers(matchups: AdvancementMatchup[]): {
  tiers: Tiered[];
  championId: string | null;
} {
  const final = findFinal(matchups);
  if (!final) return { tiers: [], championId: null };

  const depths = depthsFrom(final, matchups);
  const consumedLosers = new Set(
    matchups.flatMap((matchup) =>
      SIDES.flatMap((side) => {
        const slot = matchup[side].slot;
        return slot?.type === "loser" && slot.matchId ? [slot.matchId] : [];
      }),
    ),
  );
  const thirdPlace = matchups.find(
    (matchup) => matchup.id !== final.id && isLoserFed(matchup),
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
    matchups.flatMap((matchup) =>
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

  const tiers: Tiered[] = [];
  for (const teamId of teams) {
    if (!championId && finalists.has(teamId)) {
      tiers.push({ teamId, tier: 1, label: "Finalist" });
      continue;
    }
    if (teamId === championId) {
      tiers.push({ teamId, tier: 0, label: "Champion" });
      continue;
    }
    if (teamId === runnerUpId) {
      tiers.push({ teamId, tier: 1, label: "Runner-Up" });
      continue;
    }
    if (teamId === thirdId) {
      tiers.push({ teamId, tier: 2, label: "Third Place" });
      continue;
    }
    if (teamId === fourthId) {
      tiers.push({ teamId, tier: 3, label: "Semifinalist" });
      continue;
    }

    let eliminatedAt: number | null = null;
    for (const matchup of matchups) {
      if (consumedLosers.has(matchup.id)) continue;
      const exit = advancingSides(matchup);
      if (!exit.loser || teamOn(matchup, exit.loser) !== teamId) continue;
      const depth = depths.get(matchup.id);
      if (depth === undefined) continue;
      eliminatedAt =
        eliminatedAt === null ? depth : Math.min(eliminatedAt, depth);
    }

    if (eliminatedAt === null) {
      tiers.push({ teamId, tier: 50, label: "Made Playoffs" });
      continue;
    }
    tiers.push({
      teamId,
      tier: 10 + eliminatedAt,
      label: DEPTH_LABELS[eliminatedAt] ?? "Made Playoffs",
    });
  }
  return { tiers, championId };
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

  const ordered: { teamId: string; label: string | null }[] = [
    ...tiers
      .sort((a, b) => a.tier - b.tier || byRank(a.teamId, b.teamId))
      .map(({ teamId, label }) => ({ teamId, label })),
    ...input.standingsOrder
      .filter((teamId) => !inBracket.has(teamId))
      .map((teamId) => ({
        teamId,
        label: tiers.length ? "Missed Playoffs" : null,
      })),
  ];

  const of = ordered.length;
  const outcomes = new Map<string, TeamOutcome>();
  ordered.forEach(({ teamId, label }, index) => {
    const champion = tiers.length ? teamId === championId : index === 0;
    outcomes.set(teamId, {
      placement: index + 1,
      of,
      label: champion ? "Champion" : label,
      champion,
    });
  });
  return outcomes;
}
