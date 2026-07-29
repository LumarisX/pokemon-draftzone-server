import { ConfigService } from "@nestjs/config";
import type { Agenda } from "agenda";

// The real `agenda` package is ESM-only and breaks Jest's CJS transform.
// AgendaService never constructs an Agenda itself (one is injected), but
// `@Inject(AGENDA_CLIENT) ...: Agenda` still forces a runtime import via
// emitDecoratorMetadata, so the package must be mocked before loading the SUT.
jest.mock("agenda", () => ({}));

import { AgendaService } from "./agenda.service";

type StoredJob = {
  _id: string;
  name: string;
  nextRunAt: Date | null;
  data: { draftId?: unknown; tournamentId?: string; skipTime?: Date };
};

/**
 * Minimal in-memory stand-in for the agenda job collection, enough to assert
 * the "one job per draft" invariant across create/unique/cancel/queryJobs.
 */
function buildAgendaStub(stored: StoredJob[] = []) {
  let nextId = stored.length + 1;

  const agenda = {
    define: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    every: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    queryJobs: jest.fn(async ({ name }: { name: string }) => ({
      jobs: stored.filter((job) => job.name === name),
      total: stored.length,
    })),
    cancel: jest.fn(async ({ ids }: { ids?: string[] }) => {
      const doomed = new Set(ids ?? []);
      const before = stored.length;
      for (let i = stored.length - 1; i >= 0; i--) {
        if (doomed.has(stored[i]._id)) stored.splice(i, 1);
      }
      return before - stored.length;
    }),
    create: jest.fn((name: string, data: StoredJob["data"]) => {
      let uniqueDraftId: unknown;
      let runAt: Date | null = null;
      const builder = {
        unique: (query: Record<string, unknown>) => {
          uniqueDraftId = query["data.draftId"];
          return builder;
        },
        schedule: (time: Date) => {
          runAt = time;
          return builder;
        },
        save: async () => {
          // Mirrors the backend's upsert on (name, data.draftId).
          const existing = stored.find(
            (job) =>
              job.name === name && String(job.data.draftId) === String(uniqueDraftId),
          );
          const job = existing ?? { _id: `job-${nextId++}`, name, data, nextRunAt: runAt };
          job.data = data;
          job.nextRunAt = runAt;
          if (!existing) stored.push(job);
          return { attrs: job };
        },
      };
      return builder;
    }),
  } as unknown as jest.Mocked<Agenda>;

  return { agenda, stored };
}

function buildService(nodeEnv: string, stored: StoredJob[] = []) {
  const { agenda } = buildAgendaStub(stored);

  const configService = {
    get: jest.fn().mockReturnValue(nodeEnv),
  } as unknown as jest.Mocked<ConfigService>;

  const draftRepo = {
    findById: jest.fn().mockResolvedValue(null),
  } as any;

  const service = new AgendaService(
    agenda,
    draftRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    configService,
    {} as any,
  );

  return { service, agenda, draftRepo, stored };
}

describe("AgendaService.onModuleInit", () => {
  it("does not schedule the recurring cleanup-file-uploads cron in development", async () => {
    const { service, agenda } = buildService("development");

    await service.onModuleInit();

    expect(agenda.every).not.toHaveBeenCalled();
  });

  it("TEMPORARILY DISABLED: does not schedule cleanup-file-uploads even outside development", async () => {
    // confirmUpload() isn't wired into any module that persists upload keys
    // yet, so this cron would delete every upload (not just orphans) if it
    // ran. Re-enable in agenda.service.ts once that's fixed, and update this
    // test to expect the schedule call.
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.every).not.toHaveBeenCalled();
  });

  it("still defines the cleanup-file-uploads job handler regardless of environment", async () => {
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.define).toHaveBeenCalledWith(
      "cleanup-file-uploads",
      expect.any(Function),
    );
  });

  it("starts the agenda client in both environments", async () => {
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.start).toHaveBeenCalled();
  });

  it("drops skip jobs on startup when the draft no longer has a running timer", async () => {
    const stored: StoredJob[] = [
      {
        _id: "job-a",
        name: "skip-draft-pick",
        nextRunAt: new Date("2026-01-01T00:00:30.000Z"),
        data: { draftId: "draft-1" },
      },
    ];
    const { service } = buildService("production", stored);

    await service.onModuleInit();

    expect(stored).toHaveLength(0);
  });
});

describe("AgendaService skip-job scheduling", () => {
  const tournament = { id: "tournament-1" } as any;

  function buildDraft(overrides: Record<string, unknown> = {}) {
    return {
      _id: "draft-1",
      name: "Spring Draft",
      status: "IN_PROGRESS",
      noTimer: false,
      skipTime: new Date(Date.now() + 30_000),
      ...overrides,
    } as any;
  }

  it("keeps exactly one skip job no matter how often it is rescheduled", async () => {
    const { service, stored } = buildService("production");
    const draft = buildDraft();

    await service.resumeSkipPick(tournament, draft);
    draft.skipTime = new Date(Date.now() + 90_000);
    await service.resumeSkipPick(tournament, draft);
    await service.resumeSkipPick(tournament, draft);

    const picks = stored.filter((job) => job.name === "skip-draft-pick");
    expect(picks).toHaveLength(1);
    expect(picks[0].nextRunAt).toEqual(draft.skipTime);
  });

  it("collapses duplicates left behind by earlier builds, including ObjectId-typed draftIds", async () => {
    const stored: StoredJob[] = [
      {
        _id: "legacy-1",
        name: "skip-draft-pick",
        nextRunAt: new Date(Date.now() + 10_000),
        // Old jobs stored the raw ObjectId rather than a string.
        data: { draftId: { toString: () => "draft-1" } },
      },
      {
        _id: "legacy-2",
        name: "skip-draft-pick",
        nextRunAt: new Date(Date.now() + 20_000),
        data: { draftId: "draft-1" },
      },
    ];
    const { service } = buildService("production", stored);

    await service.resumeSkipPick(tournament, buildDraft());

    expect(stored.filter((job) => job.name === "skip-draft-pick")).toHaveLength(
      1,
    );
  });

  it("deletes every job for the draft when the timer is paused", async () => {
    const { service, stored } = buildService("production");
    const draft = buildDraft({ skipTime: new Date(Date.now() + 3 * 60 * 60_000) });

    await service.resumeSkipPick(tournament, draft);
    expect(stored.length).toBeGreaterThan(0);

    // What draft control does on pause: bank the time, clear the deadline.
    draft.status = "PAUSED";
    draft.skipTime = undefined;
    await service.cancelSkipPick(draft);

    expect(stored).toHaveLength(0);
  });

  it("schedules a one-hour reminder only when more than an hour remains", async () => {
    const { service, stored } = buildService("production");

    await service.resumeSkipPick(
      tournament,
      buildDraft({ skipTime: new Date(Date.now() + 30_000) }),
    );
    expect(stored.some((job) => job.name === "skip-draft-reminder")).toBe(false);

    await service.resumeSkipPick(
      tournament,
      buildDraft({ skipTime: new Date(Date.now() + 3 * 60 * 60_000) }),
    );
    expect(
      stored.filter((job) => job.name === "skip-draft-reminder"),
    ).toHaveLength(1);
  });

  it("removes the reminder once the skip time moves inside the last hour", async () => {
    const { service, stored } = buildService("production");
    const draft = buildDraft({ skipTime: new Date(Date.now() + 3 * 60 * 60_000) });

    await service.resumeSkipPick(tournament, draft);
    draft.skipTime = new Date(Date.now() + 30_000);
    await service.resumeSkipPick(tournament, draft);

    expect(stored.some((job) => job.name === "skip-draft-reminder")).toBe(false);
  });

  it("cancels instead of scheduling when the draft runs without a timer", async () => {
    const { service, stored } = buildService("production");
    const draft = buildDraft();

    await service.resumeSkipPick(tournament, draft);
    draft.noTimer = true;
    await service.resumeSkipPick(tournament, draft);

    expect(stored).toHaveLength(0);
  });
});
