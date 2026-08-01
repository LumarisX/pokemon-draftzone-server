import { BracketSlotInput } from "./bracket";

/**
 * Structure validation for a whole tournament's bracket.
 *
 * The stage-scoped `validateBracketStructure` assumed one seed space and one
 * round list per call. Neither holds now: rounds belong to the tournament and
 * every stage is laid out against them, while seeds are numbered *within* a
 * stage — seed 1 of the playoffs and seed 1 of a group are different teams.
 *
 * The other half of the change is what is newly legal. A `winner`/`loser` slot
 * may reference a match in a different stage, because that is exactly how a
 * playoff stage consumes a group stage's results. So references are resolved
 * across the whole payload, and only seeds are stage-local.
 */

export interface TournamentBracketStageInput {
  key: string;
  /** Decides whether seeds may repeat — see `replaysSeeds`. */
  type: string;
  /** How many teams the stage has, i.e. the valid seed range 1..teamCount. */
  teamCount: number;
}

export interface TournamentBracketMatchInput {
  key: string;
  stageKey: string;
  roundIndex: number;
  position?: number;
  label?: string;
  a: BracketSlotInput;
  b: BracketSlotInput;
}

/**
 * A round-robin or swiss stage plays the same teams every round, so its seeds
 * appear in many matches. A knockout stage enters each team once and advances
 * it by reference, so a repeated seed there is a wiring mistake.
 */
function replaysSeeds(stageType: string): boolean {
  return stageType === "round-robin" || stageType === "swiss";
}

export function validateTournamentBracket(
  stages: TournamentBracketStageInput[],
  matches: TournamentBracketMatchInput[],
  roundCount: number,
): string[] {
  const errors: string[] = [];

  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
  for (const [index, stage] of stages.entries()) {
    if (stages.findIndex((s) => s.key === stage.key) !== index)
      errors.push(`Duplicate stage key "${stage.key}"`);
  }

  const byKey = new Map<string, TournamentBracketMatchInput>();
  for (const match of matches) {
    if (byKey.has(match.key)) errors.push(`Duplicate match key "${match.key}"`);
    byKey.set(match.key, match);

    if (!stageByKey.has(match.stageKey))
      errors.push(
        `Match "${match.key}" belongs to unknown stage "${match.stageKey}"`,
      );

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

  // stage key -> seeds that stage's matches actually use.
  const seedsByStage = new Map<string, Set<number>>();
  const seenSeedInStage = new Set<string>();
  const consumedEdges = new Set<string>();

  for (const match of matches) {
    const stage = stageByKey.get(match.stageKey);

    for (const slot of [match.a, match.b]) {
      if (slot.type === "seed") {
        // Already reported as an unknown stage; the seed range is unknowable.
        if (!stage) continue;

        if (
          !Number.isInteger(slot.seed) ||
          slot.seed < 1 ||
          slot.seed > stage.teamCount
        ) {
          errors.push(
            `Match "${match.key}" uses seed ${slot.seed} of stage "${stage.key}", expected 1..${stage.teamCount}`,
          );
          continue;
        }

        const seeds = seedsByStage.get(stage.key) ?? new Set<number>();
        seeds.add(slot.seed);
        seedsByStage.set(stage.key, seeds);

        if (!replaysSeeds(stage.type)) {
          const key = `${stage.key}:${slot.seed}`;
          if (seenSeedInStage.has(key))
            errors.push(
              `Seed ${slot.seed} enters stage "${stage.key}" more than once`,
            );
          seenSeedInStage.add(key);
        }
        continue;
      }

      if (slot.from === match.key) {
        errors.push(`Match "${match.key}" references itself`);
        continue;
      }
      // Deliberately not restricted to the same stage: a playoff slot fed by a
      // group stage's match is the whole point of a tournament-wide bracket.
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

  for (const stage of stages) {
    const seeds = seedsByStage.get(stage.key);
    // A stage whose matches use no seed at all is fed entirely by reference —
    // a losers bracket or a grand final. Its teams arrive by advancing, so
    // demanding that every seed appear would fail every such stage.
    if (!seeds) continue;

    for (let seed = 1; seed <= stage.teamCount; seed++) {
      if (!seeds.has(seed))
        errors.push(`Seed ${seed} of stage "${stage.key}" never plays`);
    }
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
