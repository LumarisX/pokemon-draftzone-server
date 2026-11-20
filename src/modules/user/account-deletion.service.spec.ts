import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZError } from "@core/pdz-error";
import { AdminAuditRepository } from "@modules/admin/admin-audit.repository";
import { AppCacheService } from "@core/cache/app-cache.service";
import { AccountIdentityService } from "./account-identity.service";
import { Doc } from "./account-id-rewriter";
import {
  AccountDeletionRepository,
  LeagueRef,
  TournamentRef,
} from "./account-deletion.repository";
import {
  AccountDeletionService,
  DELETION_GRACE_MS,
} from "./account-deletion.service";
import { Auth0AccountClient } from "./auth0-account.client";
import { Collections, memoryStore } from "./testing/memory-store";
import { SignInRow, UserSignInRepository } from "./user-sign-in.repository";
import { DueDeletion, UserRepository } from "./user.repository";
import { UserService } from "./user.service";

const ACC = "a1a1a1a1a1a1a1a1a1a1a1a1";
const OTHER = "b2b2b2b2b2b2b2b2b2b2b2b2";
const GOOGLE = "google-oauth2|g";
const DISCORD = "oauth2|discord|123456789012345678";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const DUE_AT = new Date(NOW.getTime() + DELETION_GRACE_MS);

const LEAGUE: LeagueRef = { leagueSlug: "pdbl", leagueName: "PDBL" };
const SEAT: TournamentRef = {
  ...LEAGUE,
  tournamentSlug: "s4",
  tournamentName: "Season 4",
};
const OTHER_SEAT: TournamentRef = {
  leagueSlug: "bpl",
  leagueName: "BPL",
  tournamentSlug: "s12",
  tournamentName: "Season 12",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

interface Options {
  owned?: TournamentRef[];
  staff?: TournamentRef[];
  coaching?: TournamentRef[];
  scheduled?: boolean;
  auth0Fails?: boolean;
  tombstone?: string;
}

function initialCollections(): Collections {
  return new Map<string, Doc[]>([
    [
      "leaguecoaches",
      [
        {
          _id: "c1",
          auth0Id: ACC,
          name: "Coach Ash",
          gameName: "AshK",
          discordName: "ash#1",
          discordId: "111",
          timezone: "UTC",
          teamId: "t1",
        },
        { _id: "c2", auth0Id: OTHER, name: "Misty", gameName: "M", timezone: "EST" },
      ],
    ],
    [
      "tournamentapplications",
      [
        { _id: "ap1", auth0Id: ACC, status: "pending", gameName: "AshK" },
        {
          _id: "ap2",
          auth0Id: ACC,
          status: "approved",
          gameName: "AshK",
          discordName: "ash#1",
          discordId: "111",
          timezone: "UTC",
          decidedBy: OTHER,
        },
        { _id: "ap3", auth0Id: OTHER, status: "approved", decidedBy: ACC },
      ],
    ],
    [
      "tournamentmessages",
      [
        { _id: "m1", author: ACC, authorName: "Coach Ash", authorRole: "coach" },
        { _id: "m2", author: OTHER, authorName: "Misty", authorRole: "coach" },
      ],
    ],
    ["drafts", [{ _id: "d1", owner: ACC }, { _id: "d2", owner: OTHER }]],
    ["archives", [{ _id: "ar1", owner: ACC }]],
    ["plannerplans", [{ _id: "pl1", owner: ACC }, { _id: "pl2", owner: OTHER }]],
    ["teambuilderteams", [{ _id: "tb1", userSub: ACC }]],
    ["tierlistimportaliases", [{ _id: "al1", owner: ACC }]],
    ["teamidentities", [{ _id: "ti1", owner: ACC }]],
    ["leagueads", [{ _id: "ad1", owner: ACC }, { _id: "ad2", owner: OTHER }]],
    [
      "leaguetierlists",
      [
        { _id: "tl-free", createdBy: ACC, authorName: "Ash", members: [] },
        { _id: "tl-used", createdBy: ACC, authorName: "Ash", members: [] },
        { _id: "tl-copy", createdBy: ACC, authorName: "Ash", tournament: "tour-1" },
        {
          _id: "tl-other",
          createdBy: OTHER,
          members: [{ sub: ACC, role: "editor" }, { sub: OTHER, role: "viewer" }],
          collaborators: [ACC, OTHER],
        },
      ],
    ],
    ["leaguetournaments", [{ _id: "tour-2", tierList: "tl-used", staff: [] }]],
    [
      "leagues",
      [{ _id: "lg1", owner: OTHER, admins: [{ sub: ACC }, { sub: OTHER }] }],
    ],
    [
      "fileuploads",
      [
        { _id: "f1", uploadedBy: ACC, ipAddress: "1.2.3.4", userAgent: "UA", key: "k" },
      ],
    ],
    ["adminaudits", [{ _id: "au0", target: ACC }]],
  ]);
}

function setup(options: Options = {}) {
  const collections = initialCollections();
  const signInRows = new Map<string, SignInRow>([
    [DISCORD, { signIn: DISCORD, accountId: ACC, blocked: false }],
    ["auth0|other", { signIn: "auth0|other", accountId: OTHER, blocked: false }],
  ]);
  const user: Doc = {
    accountId: ACC,
    profileId: ACC,
    auth0Sub: GOOGLE,
    deletion: options.scheduled
      ? { requestedAt: NOW, scheduledFor: DUE_AT, tombstone: options.tombstone }
      : undefined,
  };
  let userRemoved = false;
  const pending = new Map<string, { attempts: number }>();
  const auditRows: { actor: string; action: string; target: string; details: Doc }[] = [];
  const invalidated: string[] = [];
  const cacheKeys: string[] = [];

  const users = {
    getUserBySub: jest.fn(async () => ({ deletion: user.deletion })),
    applyChanges: jest.fn(
      async (_id: string, changes: { set?: Doc; unset?: string[] }) => {
        for (const [path, value] of Object.entries(changes.set ?? {})) {
          if (path === "deletion.tombstone") {
            (user.deletion as Doc).tombstone = value;
          } else {
            user[path] = value;
          }
        }
        for (const path of changes.unset ?? []) delete user[path];
        return user;
      },
    ),
    cancelDeletion: jest.fn(async () => {
      if (!user.deletion || (user.deletion as Doc).tombstone) return false;
      delete user.deletion;
      return true;
    }),
    findDueDeletions: jest.fn(async (): Promise<DueDeletion[]> => {
      if (userRemoved || !user.deletion) return [];
      const deletion = user.deletion as Doc;
      return [
        {
          accountId: ACC,
          profileId: ACC,
          signIn: GOOGLE,
          requestedAt: deletion.requestedAt as Date,
          scheduledFor: deletion.scheduledFor as Date,
          tombstone: (deletion.tombstone as string | undefined) ?? null,
        },
      ];
    }),
    removeAccount: jest.fn(async () => {
      userRemoved = true;
      return true;
    }),
  };

  const signIns = {
    listByAccount: jest.fn(async (accountId: string) =>
      [...signInRows.values()].filter((row) => row.accountId === accountId),
    ),
    removeAllByAccount: jest.fn(async (accountId: string) => {
      for (const [key, row] of signInRows) {
        if (row.accountId === accountId) signInRows.delete(key);
      }
      return 1;
    }),
  };

  const userService = {
    invalidateSignIn: jest.fn(async (signIn: string) => {
      invalidated.push(signIn);
    }),
  };

  const docs = (name: string) => collections.get(name) ?? [];
  const removeWhere = (name: string, test: (doc: Doc) => boolean) => {
    collections.set(
      name,
      docs(name).filter((doc) => !test(doc)),
    );
  };

  const repository = {
    store: jest.fn(() => memoryStore(collections)),
    openOwnedTournaments: jest.fn(async () => options.owned ?? []),
    openStaffSeats: jest.fn(async () => options.staff ?? []),
    openCoachSeats: jest.fn(async () => options.coaching ?? []),
    deleteOwnedRecords: jest.fn(async () => {
      const owned: [string, string][] = [
        ["drafts", "owner"],
        ["archives", "owner"],
        ["plannerplans", "owner"],
        ["teambuilderteams", "userSub"],
        ["tierlistimportaliases", "owner"],
        ["teamidentities", "owner"],
        ["leagueads", "owner"],
      ];
      for (const [name, field] of owned) {
        removeWhere(name, (doc) => doc[field] === ACC);
      }
    }),
    purgeTierLists: jest.fn(async () => {
      const used = new Set(docs("leaguetournaments").map((t) => t.tierList));
      removeWhere(
        "leaguetierlists",
        (list) => list.createdBy === ACC && !list.tournament && !used.has(list._id),
      );
      for (const list of docs("leaguetierlists")) {
        if (list.createdBy === ACC) delete list.authorName;
        if (Array.isArray(list.members)) {
          list.members = (list.members as Doc[]).filter((m) => m.sub !== ACC);
        }
        if (Array.isArray(list.collaborators)) {
          list.collaborators = (list.collaborators as string[]).filter(
            (sub) => sub !== ACC,
          );
        }
      }
    }),
    scrubSharedRecords: jest.fn(async () => {
      for (const name of ["leaguecoaches", "tournamentapplications"]) {
        if (name === "tournamentapplications") {
          removeWhere(name, (doc) => doc.auth0Id === ACC && doc.status === "pending");
        }
        for (const doc of docs(name)) {
          if (doc.auth0Id !== ACC) continue;
          doc.gameName = "";
          doc.timezone = "";
          delete doc.discordName;
          delete doc.discordId;
        }
      }
      for (const upload of docs("fileuploads")) {
        if (upload.uploadedBy !== ACC) continue;
        delete upload.uploadedBy;
        delete upload.ipAddress;
        delete upload.userAgent;
      }
      for (const league of docs("leagues")) {
        league.admins = (league.admins as Doc[]).filter((a) => a.sub !== ACC);
      }
    }),
    recordPendingAuth0: jest.fn(async (list: string[]) => {
      for (const signIn of list) {
        if (!pending.has(signIn)) pending.set(signIn, { attempts: 0 });
      }
    }),
    listPendingAuth0: jest.fn(async () =>
      [...pending].map(([signIn, row]) => ({ signIn, attempts: row.attempts })),
    ),
    resolvePendingAuth0: jest.fn(async (signIn: string) => {
      pending.delete(signIn);
    }),
    failPendingAuth0: jest.fn(async (signIn: string) => {
      const row = pending.get(signIn);
      if (row) row.attempts++;
    }),
  };

  const audit = {
    append: jest.fn(async (entry: (typeof auditRows)[number]) => {
      auditRows.push(clone(entry));
      return `audit-${auditRows.length}`;
    }),
  };

  const auth0State = { fails: options.auth0Fails ?? false };
  const auth0 = {
    deleteUser: jest.fn(async (_signIn: string) => {
      if (auth0State.fails) throw new Error("insufficient scope");
    }),
  };

  const appCache = {
    invalidate: jest.fn(async (...keys: string[]) => {
      cacheKeys.push(...keys);
    }),
  };

  const service = new AccountDeletionService(
    { internal: true } as unknown as AccountIdentityService,
    users as unknown as UserRepository,
    signIns as unknown as UserSignInRepository,
    userService as unknown as UserService,
    repository as unknown as AccountDeletionRepository,
    audit as unknown as AdminAuditRepository,
    auth0 as unknown as Auth0AccountClient,
    appCache as unknown as AppCacheService,
  );

  return {
    service,
    user,
    users,
    signInRows,
    collections,
    repository,
    audit,
    auditRows,
    auth0,
    auth0State,
    pending,
    invalidated,
    cacheKeys,
    userRemoved: () => userRemoved,
  };
}

function find(collections: Collections, name: string, id: string): Doc | undefined {
  return (collections.get(name) ?? []).find((doc) => doc._id === id);
}

describe("AccountDeletionService blockers", () => {
  it("is empty for an account that holds nothing", async () => {
    const { service } = setup();

    expect(await service.blockers(ACC)).toEqual([]);
  });

  it("names an unfinished season in a league the account owns as an organizer seat", async () => {
    const { service } = setup({ owned: [SEAT] });

    expect(await service.blockers(ACC)).toEqual([{ kind: "organizer", ...SEAT }]);
  });

  it("lists each tournament once, organizer over coach", async () => {
    const { service } = setup({
      owned: [SEAT],
      staff: [SEAT],
      coaching: [SEAT, OTHER_SEAT],
    });

    expect(await service.blockers(ACC)).toEqual([
      { kind: "organizer", ...SEAT },
      { kind: "coach", ...OTHER_SEAT },
    ]);
  });

  it("is reported with the schedule state", async () => {
    const { service } = setup({ owned: [SEAT], scheduled: true });

    expect(await service.status(ACC)).toEqual({
      scheduledFor: DUE_AT.toISOString(),
      blockers: [{ kind: "organizer", ...SEAT }],
    });
  });
});

describe("AccountDeletionService schedule and cancel", () => {
  it("schedules thirty days out and clears the user cache", async () => {
    const { service, user, cacheKeys } = setup();

    const result = await service.schedule(ACC, NOW);

    expect(result).toEqual({ scheduledFor: DUE_AT.toISOString() });
    expect(user.deletion).toEqual({ requestedAt: NOW, scheduledFor: DUE_AT });
    expect(cacheKeys).toContain(`user:${ACC}`);
  });

  it("refuses with the blockers and writes nothing", async () => {
    const { service, user } = setup({ owned: [SEAT], coaching: [OTHER_SEAT] });

    const failure = await service.schedule(ACC, NOW).catch((error) => error);

    expect(failure).toBeInstanceOf(PDZError);
    expect(failure.code).toBe(ErrorCodes.USER.DELETION_BLOCKED.code);
    expect(failure.details.blockers).toEqual([
      { kind: "organizer", ...SEAT },
      { kind: "coach", ...OTHER_SEAT },
    ]);
    expect(user.deletion).toBeUndefined();
  });

  it("keeps the first date when scheduled again", async () => {
    const { service, users } = setup({ scheduled: true });

    const later = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const result = await service.schedule(ACC, later);

    expect(result).toEqual({ scheduledFor: DUE_AT.toISOString() });
    expect(users.applyChanges).not.toHaveBeenCalled();
  });

  it("cancels by removing the deletion", async () => {
    const { service, user, cacheKeys } = setup({ scheduled: true });

    expect(await service.cancel(ACC)).toEqual({ scheduledFor: null });
    expect(user.deletion).toBeUndefined();
    expect(cacheKeys).toContain(`user:${ACC}`);
  });

  it("refuses to cancel once the purge has started", async () => {
    const { service, user } = setup({ scheduled: true, tombstone: "deleted:abc" });

    const failure = await service.cancel(ACC).catch((error) => error);

    expect(failure).toBeInstanceOf(PDZError);
    expect(failure.code).toBe(ErrorCodes.USER.DELETION_IN_PROGRESS.code);
    expect(user.deletion).toBeDefined();
  });
});

describe("AccountDeletionService purge", () => {
  async function run(options: Options = {}) {
    const ctx = setup({ scheduled: true, ...options });
    const result = await ctx.service.runDue(DUE_AT);
    return { ctx, result };
  }

  it("leaves a blocked account scheduled and touches nothing", async () => {
    const { ctx, result } = await run({ staff: [SEAT] });

    expect(result).toEqual({ purged: 0, blocked: 1, failed: 0 });
    expect(ctx.userRemoved()).toBe(false);
    expect(ctx.repository.deleteOwnedRecords).not.toHaveBeenCalled();
    expect(ctx.auth0.deleteUser).not.toHaveBeenCalled();
    expect(find(ctx.collections, "drafts", "d1")).toBeDefined();
  });

  it("replaces the account id everywhere with one tombstone", async () => {
    const { ctx, result } = await run();

    expect(result).toEqual({ purged: 1, blocked: 0, failed: 0 });
    const message = find(ctx.collections, "tournamentmessages", "m1")!;
    expect(String(message.author)).toMatch(/^deleted:[0-9a-f]{24}$/);
    const tombstone = message.author;
    expect(find(ctx.collections, "leaguecoaches", "c1")!.auth0Id).toBe(tombstone);
    expect(find(ctx.collections, "tournamentapplications", "ap3")!.decidedBy).toBe(
      tombstone,
    );
    expect(find(ctx.collections, "tournamentmessages", "m2")!.author).toBe(OTHER);
    expect(find(ctx.collections, "adminaudits", "au0")!.target).toBe(ACC);
  });

  it("keeps the coach name and team but clears personal fields", async () => {
    const { ctx } = await run();

    const coach = find(ctx.collections, "leaguecoaches", "c1")!;
    expect(coach).toMatchObject({ name: "Coach Ash", teamId: "t1", gameName: "", timezone: "" });
    expect(coach).not.toHaveProperty("discordName");
    expect(coach).not.toHaveProperty("discordId");
    expect(find(ctx.collections, "leaguecoaches", "c2")!.gameName).toBe("M");
  });

  it("deletes pending applications and clears the rest", async () => {
    const { ctx } = await run();

    expect(find(ctx.collections, "tournamentapplications", "ap1")).toBeUndefined();
    const approved = find(ctx.collections, "tournamentapplications", "ap2")!;
    expect(approved).toMatchObject({ gameName: "", timezone: "", decidedBy: OTHER });
    expect(approved).not.toHaveProperty("discordName");
    expect(approved).not.toHaveProperty("discordId");
  });

  it("unsets who uploaded a file and from where", async () => {
    const { ctx } = await run();

    const upload = find(ctx.collections, "fileuploads", "f1")!;
    expect(upload).toEqual({ _id: "f1", key: "k" });
  });

  it("deletes owned records outright and leaves other people's", async () => {
    const { ctx } = await run();

    for (const [name, id] of [
      ["drafts", "d1"],
      ["archives", "ar1"],
      ["plannerplans", "pl1"],
      ["teambuilderteams", "tb1"],
      ["tierlistimportaliases", "al1"],
      ["teamidentities", "ti1"],
      ["leagueads", "ad1"],
    ]) {
      expect(find(ctx.collections, name, id)).toBeUndefined();
    }
    expect(find(ctx.collections, "drafts", "d2")).toBeDefined();
    expect(find(ctx.collections, "plannerplans", "pl2")).toBeDefined();
    expect(find(ctx.collections, "leagueads", "ad2")).toBeDefined();
  });

  it("deletes unused tier lists and keeps used ones under the tombstone", async () => {
    const { ctx } = await run();

    expect(find(ctx.collections, "leaguetierlists", "tl-free")).toBeUndefined();
    const used = find(ctx.collections, "leaguetierlists", "tl-used")!;
    const copy = find(ctx.collections, "leaguetierlists", "tl-copy")!;
    const tombstone = find(ctx.collections, "tournamentmessages", "m1")!.author;
    expect(used.createdBy).toBe(tombstone);
    expect(copy.createdBy).toBe(tombstone);
    expect(used).not.toHaveProperty("authorName");
  });

  it("removes the account from other tier lists and from league admins", async () => {
    const { ctx } = await run();

    const other = find(ctx.collections, "leaguetierlists", "tl-other")!;
    expect(other.members).toEqual([{ sub: OTHER, role: "viewer" }]);
    expect(other.collaborators).toEqual([OTHER]);
    expect(find(ctx.collections, "leagues", "lg1")!.admins).toEqual([{ sub: OTHER }]);
  });

  it("removes the user row and every sign-in and clears their caches", async () => {
    const { ctx } = await run();

    expect(ctx.userRemoved()).toBe(true);
    expect(ctx.signInRows.has(DISCORD)).toBe(false);
    expect(ctx.signInRows.has("auth0|other")).toBe(true);
    expect([...ctx.invalidated].sort()).toEqual([DISCORD, GOOGLE].sort());
  });

  it("deletes the Auth0 user behind every sign-in that reached the account", async () => {
    const { ctx } = await run();

    expect(ctx.auth0.deleteUser.mock.calls.map(([signIn]) => signIn).sort()).toEqual(
      [DISCORD, GOOGLE].sort(),
    );
    expect(ctx.pending.size).toBe(0);
  });

  it("writes an audit row with the profile id and dates only", async () => {
    const { ctx } = await run();

    const tombstone = find(ctx.collections, "tournamentmessages", "m1")!.author;
    expect(ctx.auditRows).toEqual([
      {
        actor: "system",
        action: "account.delete",
        target: tombstone,
        details: { profileId: ACC, requestedAt: NOW, deletedAt: DUE_AT },
      },
    ]);
  });

  it("finishes everything else and retries Auth0 later when the call fails", async () => {
    const ctx = setup({ scheduled: true, auth0Fails: true });

    const first = await ctx.service.runDue(DUE_AT);

    expect(first.purged).toBe(1);
    expect(ctx.userRemoved()).toBe(true);
    expect([...ctx.pending.keys()].sort()).toEqual([DISCORD, GOOGLE].sort());
    expect(ctx.pending.get(GOOGLE)!.attempts).toBe(1);

    ctx.auth0State.fails = false;
    const second = await ctx.service.runDue(new Date(DUE_AT.getTime() + 86_400_000));

    expect(second).toEqual({ purged: 0, blocked: 0, failed: 0 });
    expect(ctx.pending.size).toBe(0);
  });

  it("reuses the stored tombstone when a purge is retried", async () => {
    const tombstone = "deleted:aaaaaaaaaaaaaaaaaaaaaaaa";
    const { ctx } = await run({ tombstone });

    expect(find(ctx.collections, "tournamentmessages", "m1")!.author).toBe(tombstone);
    expect(ctx.users.applyChanges).not.toHaveBeenCalled();
  });

  it("leaves the account scheduled when the purge throws", async () => {
    const ctx = setup({ scheduled: true });
    ctx.repository.purgeTierLists.mockRejectedValueOnce(new Error("db down"));

    const result = await ctx.service.runDue(DUE_AT);

    expect(result).toEqual({ purged: 0, blocked: 0, failed: 1 });
    expect(ctx.userRemoved()).toBe(false);
    expect(ctx.auditRows).toEqual([]);
  });
});
