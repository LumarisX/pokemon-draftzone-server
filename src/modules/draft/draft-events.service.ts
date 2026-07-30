import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { calculateCurrentPick } from "./domain/pick-order";

type DraftPickSummary = {
  id: string;
  name: string;
  tier?: string;
  cost?: number;
};

export type DraftAddedEvent = {
  tournamentSlug: string;
  draftSlug: string;
  pick: {
    pokemon: DraftPickSummary;
    team: { id: string; name: string };
    draft: string;
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

export type DraftCounterEvent = {
  tournamentSlug: string;
  draftSlug: string;
  currentPick: ReturnType<typeof calculateCurrentPick>;
  nextTeam: string;
  canDraftTeams: string[];
  canDraftCounts: Record<string, number>;
};

/**
 * An organizer edited a roster slot out of band — set, swapped, or cleared.
 * Distinct from `added` because it isn't a turn being taken: it can land on any
 * round, and `pokemon` is absent when the slot was cleared.
 */
export type DraftPickUpdatedEvent = {
  tournamentSlug: string;
  draftSlug: string;
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

export type DraftCompletedEvent = {
  tournamentSlug: string;
  draftSlug: string;
  draftName: string;
};

export type DraftSkipEvent = {
  tournamentSlug: string;
  draftSlug: string;
  teamName: string;
  skipCount: number;
  newTimerLength?: number;
};

export type DraftStatusEvent = {
  tournamentSlug: string;
  draftSlug: string;
  status: string;
  noTimer?: boolean;
  currentPick: ReturnType<typeof calculateCurrentPick>;
};

/**
 * Anti-corruption layer between DraftEngineService and the underlying event
 * bus. Keeps DraftEngineService depending on an injected, mockable service
 * instead of EventEmitter2 directly, so the websocket layer that eventually
 * subscribes to these events (out of scope here) can change independently.
 */
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
