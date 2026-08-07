import { Types } from "mongoose";
import { StageDocument, StageSeedingEntity } from "../stage.schema";
import { RoundLike, stageTeamIds } from "./stage-axis";

/**
 * Collapses the seeding log into a summary of the most recent generation.
 *
 * A bracket composed of several sections seeds each one separately, so one
 * generation writes several entries — all sharing its `seededAt`. Grouping by
 * that timestamp is what keeps "randomized N times" counting generations
 * rather than sections.
 */
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
    // Only meaningful for a whole-bracket shuffle; per-section hashes live on
    // the group entries below.
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

interface BracketTeamDoc {
  _id: Types.ObjectId;
  slug: string;
  teamName: string;
  logo?: string;
  coach: { name: string };
}

interface BracketSlotDoc {
  type: "seed" | "winner" | "loser";
  seed?: number;
  matchId?: string;
}

interface BracketMatchupDoc {
  _id: Types.ObjectId;
  slug: string;
  round?: Types.ObjectId | null;
  section?: string;
  bracketRound?: number;
  position?: number;
  label?: string;
  side1: { slot?: BracketSlotDoc };
  side2: { slot?: BracketSlotDoc };
  winner?: string;
  results?: { replay?: string }[];
}

function mapSlot(slot: BracketSlotDoc | undefined) {
  if (!slot) return null;
  return slot.type === "seed"
    ? { type: slot.type, seed: slot.seed }
    : { type: slot.type, from: slot.matchId };
}

/**
 * @param rounds The axis to render against. Passed in rather than read off the
 *   stage because rounds moved to the tournament — see `stageRounds()`.
 */
export function buildBracketView(
  stage: StageDocument,
  matchups: BracketMatchupDoc[],
  teamDocs: BracketTeamDoc[],
  rounds: RoundLike[],
) {
  const teamObjIds = stageTeamIds(stage);
  const teams = teamObjIds
    .map((teamId, idx) => {
      const teamDoc = teamDocs.find(
        (t) => t._id.toString() === teamId.toString(),
      );
      if (!teamDoc) return null;
      return {
        seed: idx + 1,
        teamName: teamDoc.teamName,
        coachName: teamDoc.coach.name,
        logo: teamDoc.logo,
        teamId: teamDoc._id.toString(),
        teamSlug: teamDoc.slug,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const roundIdToName = new Map(
    rounds.map((round) => [round._id.toString(), round.name]),
  );

  return {
    format: stage.type,
    seeding: summarizeSeeding(stage.seedingLog),
    teams,
    sections: (stage.sections ?? []).map((section) => ({
      key: section.key,
      title: section.title ?? null,
      kind: section.kind ?? null,
      label: section.label ?? null,
      order: section.order ?? 0,
      teamCount: section.teamCount ?? null,
      roundTitles: section.roundTitles ?? null,
    })),
    rounds: rounds.map((round) => ({
      _id: round._id.toString(),
      name: round.name,
      matchDeadline: round.matchDeadline ?? null,
      tradeDeadline: round.tradeDeadline ?? null,
      bestOf: round.bestOf ?? null,
    })),
    matches: matchups.map((matchup) => ({
      // `_id` stays: slots reference their upstream match by it, so renaming
      // it to the slug would break every winner/loser chain in the bracket.
      _id: matchup._id.toString(),
      slug: matchup.slug,
      round: matchup.round?.toString() ?? null,
      roundName: matchup.round
        ? (roundIdToName.get(matchup.round.toString()) ?? null)
        : null,
      section: matchup.section ?? null,
      bracketRound: matchup.bracketRound ?? null,
      position: matchup.position ?? null,
      label: matchup.label ?? null,
      a: mapSlot(matchup.side1.slot),
      b: mapSlot(matchup.side2.slot),
      winner:
        matchup.winner === "side1"
          ? 0
          : matchup.winner === "side2"
            ? 1
            : undefined,
      replay: matchup.results?.[0]?.replay,
    })),
  };
}
