import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import {
  AdvancementMatchup,
  bracketExits,
  feedingMatchups,
  resolveBracketAdvancement,
  Walkover,
} from "./domain/advancement";
import { StageRepository } from "./stage.repository";

export interface BracketStatus {
  walkovers: Map<string, Walkover>;
  feeding: Set<string>;
}

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

  async findStatus(stageIds: Types.ObjectId[]): Promise<BracketStatus> {
    if (stageIds.length === 0)
      return { walkovers: new Map(), feeding: new Set() };
    const docs = await this.matchupRepo.findAdvancementFieldsByStages(stageIds);
    const matchups = docs.map(toAdvancementMatchup);

    const walkovers = new Map<string, Walkover>();
    for (const [id, exit] of bracketExits(matchups))
      if (exit.walkover) walkovers.set(id, exit.walkover);

    return { walkovers, feeding: feedingMatchups(matchups) };
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
