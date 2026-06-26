import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  DraftAddedEvent,
  DraftCompletedEvent,
  DraftCounterEvent,
  DraftEventsService,
  DraftSkipEvent,
  DraftStatusEvent,
} from "./draft-events.service";

describe("DraftEventsService", () => {
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: DraftEventsService;

  beforeEach(() => {
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    service = new DraftEventsService(eventEmitter);
  });

  it("emitDraftAdded emits 'draft.added' with the payload", () => {
    const payload = { tournamentId: "t-1" } as DraftAddedEvent;

    service.emitDraftAdded(payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith("draft.added", payload);
  });

  it("emitDraftCounter emits 'draft.counter' with the payload", () => {
    const payload = { tournamentId: "t-1" } as DraftCounterEvent;

    service.emitDraftCounter(payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith("draft.counter", payload);
  });

  it("emitDraftCompleted emits 'draft.completed' with the payload", () => {
    const payload = { tournamentId: "t-1" } as DraftCompletedEvent;

    service.emitDraftCompleted(payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith("draft.completed", payload);
  });

  it("emitDraftSkip emits 'league.draft.skip' with the payload", () => {
    const payload = { tournamentId: "t-1" } as DraftSkipEvent;

    service.emitDraftSkip(payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith("league.draft.skip", payload);
  });

  it("emitDraftStatus emits 'draft.status' with the payload", () => {
    const payload = { tournamentId: "t-1" } as DraftStatusEvent;

    service.emitDraftStatus(payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith("draft.status", payload);
  });
});
