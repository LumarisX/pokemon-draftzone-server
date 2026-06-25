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
  tournamentId: string;
  draftId: string;
  pick: {
    pokemon: DraftPickSummary;
    team: { id: string; name: string };
    draft: string;
  };
  canDraftTeams: string[];
  team: {
    id: string;
    name: string;
    draft: DraftPickSummary[];
  };
  currentPick: ReturnType<typeof calculateCurrentPick>;
};

export type DraftCounterEvent = {
  tournamentId: string;
  draftId: string;
  currentPick: ReturnType<typeof calculateCurrentPick>;
  nextTeam: string;
  canDraftTeams: string[];
};

export type DraftCompletedEvent = {
  tournamentId: string;
  draftId: string;
  draftName: string;
};

export type DraftSkipEvent = {
  tournamentId: string;
  draftId: string;
  teamName: string;
  skipCount: number;
  newTimerLength?: number;
};

export type DraftStatusEvent = {
  tournamentId: string;
  draftId: string;
  status: string;
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
    this.eventEmitter.emit("draft.added", payload);
  }

  emitDraftCounter(payload: DraftCounterEvent): void {
    this.eventEmitter.emit("draft.counter", payload);
  }

  emitDraftCompleted(payload: DraftCompletedEvent): void {
    this.eventEmitter.emit("draft.completed", payload);
  }

  emitDraftSkip(payload: DraftSkipEvent): void {
    this.eventEmitter.emit("league.draft.skip", payload);
  }

  emitDraftStatus(payload: DraftStatusEvent): void {
    this.eventEmitter.emit("draft.status", payload);
  }
}
