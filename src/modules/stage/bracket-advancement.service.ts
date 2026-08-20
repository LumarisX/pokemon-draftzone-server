import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import {
  AdvancementMatchup,
  blockedMatchups,
  resolveBracketAdvancement,
} from "./domain/advancement";
import { StageRepository } from "./stage.repository";

/**
 * Keeps every winner/loser-fed side of a tournament's bracket in step with the
 * results above it.
 *
 * Shared by the results editor and the bracket editor because both can change
 * who leaves a match, and a per-caller version of this drifted: recording a
 * result used to push one hop downstream while a bracket save replayed every
 * settled match, so a correction near the top of the bracket reached different
 * distances depending on which screen made it. Resolving the whole graph is
 * also what makes a *changed* answer work — an override the organizer takes
 * back has to empty the slot it had already filled.
 */
@Injectable()
export class BracketAdvancementService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  async applyToTournament(
    tournamentId: Types.ObjectId | string,
  ): Promise<number> {
    const stages = await this.stageRepo.findAllByTournament(tournamentId);
    return this.applyToStages(stages.map((stage) => stage._id));
  }

  /** @returns how many sides the pass actually changed. */
  async applyToStages(stageIds: Types.ObjectId[]): Promise<number> {
    if (stageIds.length === 0) return 0;

    const docs = await this.matchupRepo.findAdvancementFieldsByStages(stageIds);
    const matchups: AdvancementMatchup[] = docs.map(toAdvancementMatchup);

    const resolution = resolveBracketAdvancement(matchups);
    const current = new Map(matchups.map((matchup) => [matchup.id, matchup]));

    const changes: {
      _id: string;
      side: "side1" | "side2";
      team: Types.ObjectId | null;
    }[] = [];
    for (const [matchupId, sides] of resolution) {
      const matchup = current.get(matchupId)!;
      for (const side of ["side1", "side2"] as const) {
        const next = sides[side];
        if (next === undefined) continue;
        if ((matchup[side].team ?? null) === next) continue;
        changes.push({
          _id: matchupId,
          side,
          team: next ? new Types.ObjectId(next) : null,
        });
      }
    }

    await this.matchupRepo.applyAdvancementDiff(changes);
    return changes.length;
  }

  /**
   * The matches that have stopped the bracket, for an organizer to unstick.
   * See `blockedMatchups` — it needs the whole bracket, not one match.
   */
  async findBlocked(stageIds: Types.ObjectId[]): Promise<Set<string>> {
    if (stageIds.length === 0) return new Set();
    const docs = await this.matchupRepo.findAdvancementFieldsByStages(stageIds);
    return blockedMatchups(docs.map(toAdvancementMatchup));
  }
}

function toAdvancementMatchup(doc: {
  _id: unknown;
  winner?: string | null;
  advances?: string | null;
  side1?: AdvancementSide;
  side2?: AdvancementSide;
}): AdvancementMatchup {
  return {
    id: String(doc._id),
    winner: doc.winner ?? null,
    advances: (doc.advances ?? null) as AdvancementMatchup["advances"],
    side1: toSide(doc.side1),
    side2: toSide(doc.side2),
  };
}

interface AdvancementSide {
  slot?: { type: string; matchId?: string } | null;
  team?: unknown;
}

function toSide(side?: AdvancementSide) {
  return {
    slot: side?.slot
      ? { type: side.slot.type, matchId: side.slot.matchId }
      : null,
    team: side?.team ? String(side.team) : null,
  };
}
