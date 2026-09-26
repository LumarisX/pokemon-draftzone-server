import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { calculateCurrentPick } from "./domain/pick-order";
import { picksAreBlind, PicksVisibleTo } from "./domain/pick-visibility";

type DraftPickSummary = {
  id: string;
  name: string;
  tier?: string;
  cost?: number;
};

export type DraftEventAudience = {
  draftPublic: boolean;
  blindTeamId?: string;
};

export function draftAudience(
  draft: { public?: boolean; picksVisibleTo?: PicksVisibleTo; status?: string },
  revealsTeamId?: string,
): DraftEventAudience {
  return {
    draftPublic: draft.public !== false,
    ...(revealsTeamId && picksAreBlind(draft)
      ? { blindTeamId: revealsTeamId }
      : {}),
  };
}

type AudiencedEvent = {
  tournamentSlug: string;
  poolSlug: string;
  audience: DraftEventAudience;
};

export type DraftAddedEvent = AudiencedEvent & {
  pick: {
    pokemon: DraftPickSummary;
    team: { id: string; name: string };
    pool: string;
  };
  canDraftTeams: string[];
  canDraftCounts: Record<string, number>;
  team: {
    id: string;
    name: string;
    draft: DraftPickSummary[];
  };
  currentPick: ReturnType<typeof calculateCurrentPick>;
};

export type DraftCounterEvent = AudiencedEvent & {
  currentPick: ReturnType<typeof calculateCurrentPick>;
  nextTeam: string;
  canDraftTeams: string[];
  canDraftCounts: Record<string, number>;
};

export type DraftPickUpdatedEvent = AudiencedEvent & {
  round?: number;
  pokemon?: DraftPickSummary;
  previous?: DraftPickSummary;
  team: {
    id: string;
    name: string;
    draft: DraftPickSummary[];
  };
  canDraftTeams: string[];
  canDraftCounts: Record<string, number>;
  currentPick: ReturnType<typeof calculateCurrentPick>;
};

export type DraftCompletedEvent = AudiencedEvent & {
  poolName: string;
};

export type DraftSkipEvent = AudiencedEvent & {
  teamName: string;
  skipCount: number;
  newTimerLength?: number;
};

export type DraftStatusEvent = AudiencedEvent & {
  status: string;
  noTimer?: boolean;
  currentPick: ReturnType<typeof calculateCurrentPick>;
};

@Injectable()
export class DraftEventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emitDraftAdded(payload: DraftAddedEvent): void {
    this.eventEmitter.emit("league.draft.added", payload);
  }

  emitDraftCounter(payload: DraftCounterEvent): void {
    this.eventEmitter.emit("league.draft.counter", payload);
  }

  emitDraftPickUpdated(payload: DraftPickUpdatedEvent): void {
    this.eventEmitter.emit("league.draft.updated", payload);
  }

  emitDraftCompleted(payload: DraftCompletedEvent): void {
    this.eventEmitter.emit("league.draft.completed", payload);
  }

  emitDraftSkip(payload: DraftSkipEvent): void {
    this.eventEmitter.emit("league.draft.skip", payload);
  }

  emitDraftStatus(payload: DraftStatusEvent): void {
    this.eventEmitter.emit("league.draft.status", payload);
  }
}
