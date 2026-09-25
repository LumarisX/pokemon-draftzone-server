import { StageSeedingEntity } from "../stage.schema";

export function summarizeSeeding(seedingLog: StageSeedingEntity[]) {
  if (seedingLog.length === 0) return null;

  const stamps = [...new Set(seedingLog.map((e) => e.seededAt.getTime()))].sort(
    (a, b) => a - b,
  );
  const latest = stamps[stamps.length - 1];
  const groups = seedingLog.filter((e) => e.seededAt.getTime() === latest);

  const allRandom = groups.every((g) => g.method === "certified-random");
  const allManual = groups.every((g) => g.method === "manual");

  return {
    method: allRandom
      ? ("certified-random" as const)
      : allManual
        ? ("manual" as const)
        : ("mixed" as const),
    seededAt: groups[0].seededAt,
    inputTeamsHash:
      groups.length === 1 ? (groups[0].inputTeamsHash ?? null) : null,
    algorithmVersion:
      groups.length === 1 ? (groups[0].algorithmVersion ?? null) : null,
    timesSeeded: stamps.length,
    groups: groups.map((g) => ({
      method: g.method,
      label: g.label ?? null,
      seedFrom: g.seedFrom ?? null,
      seedTo: g.seedTo ?? null,
      inputTeamsHash: g.inputTeamsHash ?? null,
      algorithmVersion: g.algorithmVersion ?? null,
    })),
  };
}
