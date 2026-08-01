import { StageSeedingEntity } from "../stage.schema";
import { certifiedRandomSeedOrder } from "./bracket";

export interface SeedGroupInput {
  teamIds: string[];
  method: string;
  label?: string;
}

export interface SeedGroupResolution {
  seedOrder: string[];
  /** Append to the stage's `seedingLog`; one entry per group. */
  logEntries: StageSeedingEntity[];
}

/**
 * Turns seed groups into a seed order, plus the permanent log entries recording
 * how each block was drawn.
 *
 * Groups resolve one at a time so a shuffle never crosses a block boundary:
 * group i occupies the seeds right after group i-1, and a "certified-random"
 * group is shuffled only among its own teams, server-side, with a CSPRNG — the
 * organizer first sees the placements after they exist.
 *
 * Pure, and returns the log rather than writing it, so the stage-scoped and
 * tournament-scoped bracket paths draw seeds by exactly the same rules. That
 * matters more than the deduplication: a second implementation of a
 * certified-random draw is a second thing that can quietly stop being
 * certified.
 *
 * @param seedBase Seeds already taken before this call, so `seedFrom`/`seedTo`
 *   are absolute within the stage rather than relative to the group.
 */
export function resolveSeedGroups(
  seedGroups: SeedGroupInput[],
  sub: string,
  seedBase = 0,
): SeedGroupResolution {
  const seededAt = new Date();
  const seedOrder: string[] = [];
  const logEntries: StageSeedingEntity[] = [];

  for (const group of seedGroups) {
    const seedFrom = seedBase + seedOrder.length + 1;
    if (group.method === "certified-random") {
      const shuffle = certifiedRandomSeedOrder(group.teamIds);
      seedOrder.push(...shuffle.seedOrder);
      logEntries.push({
        method: "certified-random",
        seededAt,
        seededBy: sub,
        inputTeamsHash: shuffle.inputTeamsHash,
        algorithmVersion: shuffle.algorithmVersion,
        label: group.label,
        seedFrom,
        seedTo: seedBase + seedOrder.length,
      });
    } else {
      seedOrder.push(...group.teamIds);
      logEntries.push({
        method: "manual",
        seededAt,
        seededBy: sub,
        label: group.label,
        seedFrom,
        seedTo: seedBase + seedOrder.length,
      });
    }
  }

  return { seedOrder, logEntries };
}
