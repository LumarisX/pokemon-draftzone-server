import { createHash, randomInt } from "node:crypto";

export type BracketSlotInput =
  | { type: "seed"; seed: number }
  | { type: "winner"; from: string }
  | { type: "loser"; from: string };

export interface BracketMatchInput {
  key: string;
  roundIndex: number;
  section?: string;
  bracketRound?: number;
  position?: number;
  label?: string;
  a: BracketSlotInput;
  b: BracketSlotInput;
}

export const CERTIFIED_SHUFFLE_ALGORITHM = "fisher-yates-csprng-v1";

export function validateBracketStructure(
  matches: BracketMatchInput[],
  teamCount: number,
  roundCount: number,
): string[] {
  const errors: string[] = [];
  const byKey = new Map<string, BracketMatchInput>();

  if (matches.length === 0) return ["Bracket has no matches"];

  for (const match of matches) {
    if (byKey.has(match.key)) errors.push(`Duplicate match key "${match.key}"`);
    byKey.set(match.key, match);

    if (
      !Number.isInteger(match.roundIndex) ||
      match.roundIndex < 0 ||
      match.roundIndex >= roundCount
    ) {
      errors.push(
        `Match "${match.key}" has round index ${match.roundIndex}, expected 0..${roundCount - 1}`,
      );
    }
  }

  const seenSeeds = new Set<number>();
  const consumedEdges = new Set<string>();
  for (const match of matches) {
    for (const slot of [match.a, match.b]) {
      if (slot.type === "seed") {
        if (
          !Number.isInteger(slot.seed) ||
          slot.seed < 1 ||
          slot.seed > teamCount
        ) {
          errors.push(
            `Match "${match.key}" uses seed ${slot.seed}, expected 1..${teamCount}`,
          );
          continue;
        }
        if (seenSeeds.has(slot.seed))
          errors.push(`Seed ${slot.seed} enters the bracket more than once`);
        seenSeeds.add(slot.seed);
        continue;
      }

      if (slot.from === match.key) {
        errors.push(`Match "${match.key}" references itself`);
        continue;
      }
      if (!byKey.has(slot.from)) {
        errors.push(
          `Match "${match.key}" references missing match "${slot.from}"`,
        );
        continue;
      }
      const edge = `${slot.type}:${slot.from}`;
      if (consumedEdges.has(edge))
        errors.push(`${slot.type} of "${slot.from}" is used more than once`);
      consumedEdges.add(edge);
    }
  }

  for (let seed = 1; seed <= teamCount; seed++) {
    if (!seenSeeds.has(seed))
      errors.push(`Seed ${seed} never enters the bracket`);
  }

  const state = new Map<string, "visiting" | "done">();
  const visit = (key: string): boolean => {
    if (state.get(key) === "done") return false;
    if (state.get(key) === "visiting") return true;
    state.set(key, "visiting");
    const match = byKey.get(key);
    if (match) {
      for (const slot of [match.a, match.b]) {
        if (slot.type !== "seed" && byKey.has(slot.from) && visit(slot.from))
          return true;
      }
    }
    state.set(key, "done");
    return false;
  };
  for (const match of matches) {
    if (visit(match.key)) {
      errors.push(`Cycle detected involving match "${match.key}"`);
      break;
    }
  }

  return errors;
}

export interface CertifiedShuffleResult {
  seedOrder: string[];
  inputTeamsHash: string;
  algorithmVersion: string;
}

export function certifiedRandomSeedOrder(
  teamIds: string[],
): CertifiedShuffleResult {
  const canonical = [...teamIds].sort();
  const inputTeamsHash = createHash("sha256")
    .update(canonical.join("\n"))
    .digest("hex");

  const seedOrder = [...canonical];
  for (let i = seedOrder.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [seedOrder[i], seedOrder[j]] = [seedOrder[j], seedOrder[i]];
  }

  return {
    seedOrder,
    inputTeamsHash,
    algorithmVersion: CERTIFIED_SHUFFLE_ALGORITHM,
  };
}
