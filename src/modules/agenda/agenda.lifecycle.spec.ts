import { ConfigService } from "@nestjs/config";
import {
  Agenda,
  AgendaBackend,
  JobParameters,
  JobRepository,
  JobsQueryOptions,
  RemoveJobsOptions,
} from "agenda";
import { Types } from "mongoose";
import { AgendaService } from "./agenda.service";

type StoredJob = Record<string, unknown> & { _id: string; name: string };

const NULLED_ON_SAVE = [
  "lockedAt",
  "lastFinishedAt",
  "failedAt",
  "failCount",
  "failReason",
  "repeatTimezone",
  "lastRunAt",
  "repeatInterval",
  "repeatAt",
  "disabled",
  "progress",
  "debounceStartedAt",
  "fork",
  "startDate",
  "endDate",
  "skipDays",
];

function valueAt(doc: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      doc,
    );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date)
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  return a === b;
}

function copy<T>(job: T): T {
  return structuredClone(job);
}

function toParameters(job: StoredJob): JobParameters {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(copy(job)))
    result[key] = value === null && key !== "nextRunAt" ? undefined : value;
  return result as unknown as JobParameters;
}

class InMemoryJobRepository implements JobRepository {
  readonly jobs: StoredJob[] = [];

  async connect() {}

  private find(id: unknown, name?: string) {
    return this.jobs.find(
      (job) => job._id === String(id) && (!name || job.name === name),
    );
  }

  private matches(job: StoredJob, options: RemoveJobsOptions) {
    if (options.id && job._id !== String(options.id)) return false;
    if (options.ids?.length && !options.ids.map(String).includes(job._id))
      return false;
    if (options.name && job.name !== options.name) return false;
    if (options.names?.length && !options.names.includes(job.name)) return false;
    if (options.notNames?.length && options.notNames.includes(job.name))
      return false;
    return true;
  }

  async queryJobs(options: JobsQueryOptions = {}) {
    const jobs = this.jobs
      .filter((job) =>
        this.matches(job, {
          name: options.name,
          names: options.names,
          ids: options.ids,
          id: options.id,
        }),
      )
      .map(toParameters);
    return { jobs, total: jobs.length } as never;
  }

  async getJobsOverview() {
    return [];
  }

  async getDistinctJobNames() {
    return [...new Set(this.jobs.map((job) => job.name))];
  }

  async getJobById(id: string) {
    const job = this.find(id);
    return job ? toParameters(job) : null;
  }

  async getQueueSize() {
    return this.jobs.filter(
      (job) => job.nextRunAt && (job.nextRunAt as Date) <= new Date(),
    ).length;
  }

  async removeJobs(options: RemoveJobsOptions) {
    if (!Object.values(options).some((value) => value !== undefined)) return 0;
    const before = this.jobs.length;
    for (let i = this.jobs.length - 1; i >= 0; i--)
      if (this.matches(this.jobs[i], options)) this.jobs.splice(i, 1);
    return before - this.jobs.length;
  }

  async saveJob<DATA = unknown>(job: JobParameters<DATA>) {
    const { _id, unique, ...props } = job as JobParameters<DATA> &
      Record<string, unknown>;
    delete props.uniqueOpts;
    const set: Record<string, unknown> = { ...copy(props) };
    for (const key of NULLED_ON_SAVE) set[key] = set[key] ?? null;

    if (_id) {
      const existing = this.find(_id, props.name as string);
      if (!existing) return job;
      Object.assign(existing, set);
      return toParameters(existing) as JobParameters<DATA>;
    }

    if (unique) {
      const query = { ...(unique as Record<string, unknown>), name: props.name };
      const existing = this.jobs.find((stored) =>
        Object.entries(query).every(([path, value]) =>
          sameValue(valueAt(stored, path), value),
        ),
      );
      if (existing) {
        Object.assign(existing, set);
        return toParameters(existing) as JobParameters<DATA>;
      }
    }

    const created = {
      ...set,
      _id: new Types.ObjectId().toHexString(),
    } as StoredJob;
    this.jobs.push(created);
    return toParameters(created) as JobParameters<DATA>;
  }

  async saveJobState(job: JobParameters) {
    const existing = this.find(job._id, job.name);
    if (!existing)
      throw new Error(`job ${String(job._id)} cannot be updated, it was removed`);
    Object.assign(existing, {
      lockedAt: job.lockedAt ?? null,
      nextRunAt: job.nextRunAt ?? null,
      lastRunAt: job.lastRunAt ?? null,
      lastFinishedAt: job.lastFinishedAt ?? null,
      failCount: job.failCount ?? null,
      failReason: job.failReason ?? null,
    });
  }

  async lockJob(job: JobParameters) {
    const existing = this.find(job._id, job.name);
    if (
      !existing ||
      existing.lockedAt ||
      existing.disabled ||
      !sameValue(existing.nextRunAt, job.nextRunAt)
    )
      return undefined;
    existing.lockedAt = new Date();
    return toParameters(existing);
  }

  async unlockJob(job: JobParameters) {
    const existing = this.find(job._id);
    if (existing && existing.nextRunAt !== null) existing.lockedAt = null;
  }

  async unlockJobs(ids: unknown[]) {
    for (const id of ids) {
      const existing = this.find(id);
      if (existing) existing.lockedAt = null;
    }
  }

  async getNextJobToRun(
    jobName: string,
    nextScanAt: Date,
    lockDeadline: Date,
    now?: Date,
  ) {
    const job = this.jobs
      .filter(
        (stored) =>
          stored.name === jobName &&
          !stored.disabled &&
          ((!stored.lockedAt &&
            stored.nextRunAt &&
            (stored.nextRunAt as Date) <= nextScanAt) ||
            (stored.lockedAt && (stored.lockedAt as Date) <= lockDeadline)),
      )
      .sort(
        (a, b) =>
          ((a.nextRunAt as Date)?.getTime() ?? 0) -
          ((b.nextRunAt as Date)?.getTime() ?? 0),
      )[0];
    if (!job) return undefined;
    job.lockedAt = now ?? new Date();
    return toParameters(job);
  }

  async disableJobs() {
    return 0;
  }

  async enableJobs() {
    return 0;
  }

  async purgeAllJobs() {
    const count = this.jobs.length;
    this.jobs.length = 0;
    return count;
  }
}

type FakeDraft = {
  _id: Types.ObjectId;
  tournamentId: Types.ObjectId;
  name: string;
  status: string;
  noTimer: boolean;
  skipTime?: Date;
  remainingTime?: number;
  counter: number;
  save: jest.Mock;
};

const TURN_MS = 250;

function setup() {
  const repository = new InMemoryJobRepository();
  const backend: AgendaBackend = {
    name: "in-memory",
    repository,
    connect: async () => {},
    disconnect: async () => {},
  };
  const agenda = new Agenda({
    backend,
    processEvery: 50,
    defaultLockLifetime: 1000,
  });

  const draft: FakeDraft = {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(),
    name: "Pool A",
    status: "IN_PROGRESS",
    noTimer: false,
    skipTime: new Date(Date.now() + TURN_MS),
    counter: 0,
    save: jest.fn().mockResolvedValue(undefined),
  };

  const draftRepo = {
    findRunningTimed: jest.fn(async () =>
      draft.status === "IN_PROGRESS" && !draft.noTimer ? [draft] : [],
    ),
    findById: jest.fn(async () => draft),
    findPopulatedById: jest.fn(async () => draft),
  };
  const hostedTournamentRepo = {
    findById: jest.fn(async () => ({
      id: String(draft.tournamentId),
      tierListId: "tier-list",
    })),
  };
  const tierListRepo = { findById: jest.fn(async () => ({})) };
  const config = {
    get: jest.fn((key: string) => (key === "NODE_ENV" ? "test" : undefined)),
  } as unknown as ConfigService;

  const skips: number[] = [];
  const draftEngine = {
    skipCurrentPick: jest.fn(async () => {
      skips.push(draft.counter);
      draft.counter += 1;
      draft.skipTime = new Date(Date.now() + TURN_MS);
      await service.resumeSkipPick({ id: String(draft.tournamentId) }, draft as never);
      await draft.save();
      return "skipped";
    }),
    restartClock: jest.fn(),
  };

  const service = new AgendaService(
    agenda,
    draftRepo as never,
    hostedTournamentRepo as never,
    tierListRepo as never,
    {} as never,
    {} as never,
    config,
    draftEngine as never,
  );

  return { agenda, repository, service, draft, skips, draftEngine };
}

async function waitFor(check: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("AgendaService with a real Agenda job processor", () => {
  let context: ReturnType<typeof setup>;

  afterEach(async () => {
    await context.service.onModuleDestroy();
  });


  it("keeps firing when one timeout is followed by another", async () => {
    context = setup();
    await context.service.onModuleInit();

    await waitFor(() => context.skips.length >= 3, TURN_MS * 12);

    expect(context.skips).toEqual([0, 1, 2]);
  });

  it("leaves exactly one pending skip job after each timeout", async () => {
    context = setup();
    await context.service.onModuleInit();

    await waitFor(() => context.skips.length >= 2, TURN_MS * 10);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const pending = context.repository.jobs.filter(
      (job) => job.name === "skip-draft-pick" && job.nextRunAt,
    );
    expect(pending).toHaveLength(1);
    expect(new Date(pending[0].nextRunAt as Date).getTime()).toBe(
      context.draft.skipTime!.getTime(),
    );
  });

  it("does not restart the runner when a skip finishes after shutdown", async () => {
    context = setup();
    const { draftEngine, service, skips } = context;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const skip = draftEngine.skipCurrentPick.getMockImplementation()!;
    draftEngine.skipCurrentPick.mockImplementationOnce(async () => {
      await held;
      return skip();
    });
    await service.onModuleInit();

    await waitFor(() => draftEngine.skipCurrentPick.mock.calls.length >= 1, TURN_MS * 8);
    await service.onModuleDestroy();
    release();
    await new Promise((resolve) => setTimeout(resolve, TURN_MS * 3));

    expect(skips).toEqual([0]);
  });

  it("retries a skip that met a concurrent change, then keeps firing", async () => {
    context = setup();
    const { draftEngine, service, skips } = context;
    draftEngine.skipCurrentPick.mockImplementationOnce(async () => "busy");
    await service.onModuleInit();

    await waitFor(() => skips.length >= 2, 9000);

    expect(draftEngine.skipCurrentPick.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(skips).toEqual([0, 1]);
  }, 15000);

  it("passes the turn the job was scheduled for to the engine", async () => {
    context = setup();
    const { draftEngine, service, draft } = context;
    const scheduledFor = draft.skipTime!.getTime();
    await service.onModuleInit();

    await waitFor(() => draftEngine.skipCurrentPick.mock.calls.length >= 1, TURN_MS * 8);

    const [, , expected] = draftEngine.skipCurrentPick.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { counter: number; skipTime: Date },
    ];
    expect(expected.counter).toBe(0);
    expect(expected.skipTime.getTime()).toBe(scheduledFor);
  });

  it("recreates a lost job so the turn still times out", async () => {
    context = setup();
    const { repository, service, skips } = context;
    await service.onModuleInit();
    repository.jobs.splice(0, repository.jobs.length);

    await expect(service.ensureDraftJobs()).resolves.toBe(1);
    await waitFor(() => skips.length >= 1, TURN_MS * 8);

    expect(skips[0]).toBe(0);
  });

  it("leaves a draft alone while its job is pending", async () => {
    context = setup();
    const { draft, service } = context;
    draft.skipTime = new Date(Date.now() + 60_000);
    await service.onModuleInit();

    await expect(service.ensureDraftJobs()).resolves.toBe(0);
  });

  it("does not fire a deadline again once its job has run", async () => {
    context = setup();
    const { draft, draftEngine, service } = context;
    draftEngine.skipCurrentPick.mockImplementationOnce(async () => "stale");
    await service.onModuleInit();

    await waitFor(() => draftEngine.skipCurrentPick.mock.calls.length >= 1, TURN_MS * 8);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(draft.counter).toBe(0);
    await expect(service.ensureDraftJobs()).resolves.toBe(0);
  });

  it("drops a job whose turn has already moved on", async () => {
    context = setup();
    const { draft, repository, service, draftEngine } = context;
    draft.skipTime = new Date(Date.now() + 60_000);
    await service.onModuleInit();

    draft.counter = 1;
    repository.jobs.push({
      _id: new Types.ObjectId().toHexString(),
      name: "skip-draft-pick",
      nextRunAt: new Date(Date.now() + 50),
      data: {
        tournamentId: String(draft.tournamentId),
        draftId: String(draft._id),
        skipTime: draft.skipTime,
        counter: 0,
        retryCount: 1,
      },
      lockedAt: null,
    });

    await waitFor(
      () => repository.jobs.filter((job) => job.name === "skip-draft-pick").length === 1,
      TURN_MS * 8,
    );

    expect(draftEngine.skipCurrentPick).not.toHaveBeenCalled();
  });

  it("keeps the new turn's job when a stale job for an old deadline fires", async () => {
    context = setup();
    const { draft, repository, service } = context;
    draft.skipTime = new Date(Date.now() + 60_000);
    await service.onModuleInit();

    repository.jobs.push({
      _id: new Types.ObjectId().toHexString(),
      name: "skip-draft-pick",
      nextRunAt: new Date(Date.now() + 50),
      data: {
        tournamentId: String(draft.tournamentId),
        draftId: String(draft._id),
        skipTime: new Date(Date.now() - 10_000),
      },
      lockedAt: null,
    });

    await waitFor(
      () => repository.jobs.filter((job) => job.name === "skip-draft-pick").length === 1,
      TURN_MS * 8,
    );

    const remaining = repository.jobs.filter(
      (job) => job.name === "skip-draft-pick",
    );
    expect(context.skips).toEqual([]);
    expect(remaining).toHaveLength(1);
    expect(new Date(remaining[0].nextRunAt as Date).getTime()).toBe(
      draft.skipTime.getTime(),
    );
  });
});
