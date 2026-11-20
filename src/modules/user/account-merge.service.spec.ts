import { AdminAuditRepository } from "@modules/admin/admin-audit.repository";
import { AccountIdentityService } from "./account-identity.service";
import { Doc, RewriteRecord } from "./account-id-rewriter";
import {
  AccountMergeOfferService,
  StoredMergeOffer,
} from "./account-merge-offer.service";
import { AccountMergeRepository } from "./account-merge.repository";
import { AccountMergeService } from "./account-merge.service";
import {
  Collections,
  matches,
  memoryStore,
  setPath,
  unsetPath,
} from "./testing/memory-store";
import { SignInRow, UserSignInRepository } from "./user-sign-in.repository";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

const CUR = "a1a1a1a1a1a1a1a1a1a1a1a1";
const OTH = "b2b2b2b2b2b2b2b2b2b2b2b2";
const DISCORD = "123456789012345678";
const DISCORD_SIGN_IN = `oauth2|discord|${DISCORD}`;
const GOOGLE_SIGN_IN = "google-oauth2|g";
const ADMIN = "c3c3c3c3c3c3c3c3c3c3c3c3";
const TOKEN = "token-1";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function initialUsers(): Map<string, Doc> {
  return new Map<string, Doc>([
    [
      CUR,
      {
        _id: CUR,
        auth0Sub: GOOGLE_SIGN_IN,
        displayName: "Google Me",
        settings: { theme: "dark" },
        roles: ["dev"],
        profile: { discordName: "typed", gameName: "GG" },
        joined: new Date("2025-01-01"),
      },
    ],
    [
      OTH,
      {
        _id: OTH,
        auth0Sub: DISCORD_SIGN_IN,
        displayName: "Discord Me",
        settings: { theme: "light" },
        roles: ["tournament-creator"],
        profile: { discordName: "ash", timezone: "UTC" },
        discord: {
          id: DISCORD,
          username: "ash",
          connectedAt: new Date("2025-02-01"),
          refreshedAt: new Date("2025-02-02"),
        },
        joined: new Date("2024-01-01"),
      },
    ],
  ]);
}

function initialCollections(): Collections {
  return new Map<string, Doc[]>([
    [
      "plannerplans",
      [
        {
          _id: "p1",
          owner: CUR,
          key: "plannerData",
          revision: 1,
          plans: [{ draftName: "Main", team: ["a"] }],
        },
        {
          _id: "p2",
          owner: OTH,
          key: "plannerData",
          revision: 3,
          plans: [
            { draftName: "Main", team: ["b"] },
            { draftName: "Other", team: ["c"] },
          ],
        },
        {
          _id: "p3",
          owner: OTH,
          key: "plannerData:l/t",
          revision: 1,
          plans: [{ draftName: "T" }],
        },
      ],
    ],
    [
      "drafts",
      [
        { _id: "d1", owner: CUR, slug: "abc" },
        { _id: "d2", owner: OTH, slug: "abc" },
        { _id: "d3", owner: OTH, slug: "xyz" },
      ],
    ],
    [
      "tierlistimportaliases",
      [
        { _id: "a1", owner: CUR, text: "zard", pokemonIds: ["x"] },
        { _id: "a2", owner: OTH, text: "zard", pokemonIds: ["y"] },
        { _id: "a3", owner: OTH, text: "mew", pokemonIds: ["z"] },
      ],
    ],
    [
      "leagues",
      [{ _id: "l1", owner: OTH, admins: [{ sub: OTH }, { sub: "other-person" }] }],
    ],
    ["adminaudits", [{ _id: "x1", target: OTH, details: { note: OTH } }]],
    ["usersignins", [{ _id: "s1", signIn: DISCORD_SIGN_IN, accountId: OTH }]],
  ]);
}

interface Options {
  internal?: boolean;
  keep?: "current" | "other";
  blockers?: string[];
  failOnRepoint?: number;
}

function setup(options: Options = {}) {
  const users = initialUsers();
  const collections = initialCollections();
  const signInRows = new Map<string, SignInRow>([
    [DISCORD_SIGN_IN, { signIn: DISCORD_SIGN_IN, accountId: OTH, blocked: false }],
    ["auth0|extra", { signIn: "auth0|extra", accountId: OTH, blocked: true }],
  ]);
  const savedRecords = new Map<string, RewriteRecord[]>();
  const auditRows: {
    id: string;
    actor: string;
    action: string;
    target: string;
    details: Record<string, unknown>;
  }[] = [];
  const offers = new Map<string, StoredMergeOffer>();
  const invalidated: string[] = [];
  let repointCalls = 0;
  const initial = {
    users: clone(users),
    collections: clone(collections),
    signIns: clone(signInRows),
  };

  const userRepository = {
    findDiscordHolder: jest.fn(async (discordId: string) => {
      for (const [id, row] of users) {
        const discord = row.discord as Doc | undefined;
        if (discord?.id === discordId || row.auth0Sub === `oauth2|discord|${discordId}`) {
          return { accountId: id, signIn: String(row.auth0Sub) };
        }
      }
      return null;
    }),
    findRawAccount: jest.fn(async (id: string) =>
      users.has(id) ? clone(users.get(id)!) : null,
    ),
    restoreRawAccount: jest.fn(async (doc: Doc) => {
      users.set(String(doc._id), clone(doc));
    }),
    removeAccount: jest.fn(async (id: string) => users.delete(id)),
    applyChanges: jest.fn(
      async (id: string, changes: { set?: Doc; unset?: string[] }) => {
        const row = users.get(id)!;
        const incoming = changes.set?.discord as Doc | undefined;
        if (incoming) {
          for (const [other, candidate] of users) {
            if (other !== id && (candidate.discord as Doc | undefined)?.id === incoming.id) {
              throw new Error("duplicate discord id");
            }
          }
        }
        for (const [path, value] of Object.entries(changes.set ?? {})) {
          setPath(row, path, clone(value));
        }
        for (const path of changes.unset ?? []) unsetPath(row, path);
        return row;
      },
    ),
  };

  const signIns = {
    find: jest.fn(async (signIn: string) => signInRows.get(signIn) ?? null),
    listByAccount: jest.fn(async (accountId: string) =>
      [...signInRows.values()].filter((row) => row.accountId === accountId),
    ),
    point: jest.fn(async (signIn: string, accountId: string) => {
      if (signInRows.has(signIn)) return false;
      signInRows.set(signIn, { signIn, accountId, blocked: false });
      return true;
    }),
    repoint: jest.fn(async (signIn: string, from: string, to: string) => {
      repointCalls++;
      if (options.failOnRepoint === repointCalls) throw new Error("db down");
      const row = signInRows.get(signIn);
      if (!row || row.accountId !== from) return false;
      row.accountId = to;
      return true;
    }),
    remove: jest.fn(async (signIn: string, accountId: string) => {
      const row = signInRows.get(signIn);
      if (!row || row.accountId !== accountId) return false;
      signInRows.delete(signIn);
      return true;
    }),
  };

  const userService = {
    invalidateSignIn: jest.fn(async (signIn: string) => {
      invalidated.push(signIn);
    }),
    getMeConnected: jest.fn(async (id: string) => ({ sub: id })),
  };

  const repository = {
    find: jest.fn(async (collection: string, filter: Doc) =>
      clone((collections.get(collection) ?? []).filter((doc) => matches(doc, filter))),
    ),
    insert: jest.fn(async (collection: string, doc: Doc) => {
      collections.get(collection)!.push(clone(doc));
    }),
    remove: jest.fn(async (collection: string, id: unknown) => {
      const docs = collections.get(collection)!;
      const index = docs.findIndex((doc) => doc._id === id);
      if (index !== -1) docs.splice(index, 1);
    }),
    setFields: jest.fn(async (collection: string, filter: Doc, set: Doc) => {
      const doc = (collections.get(collection) ?? []).find((candidate) =>
        matches(candidate, filter),
      );
      if (!doc) return false;
      for (const [path, value] of Object.entries(set)) setPath(doc, path, clone(value));
      return true;
    }),
    store: jest.fn(() => memoryStore(collections)),
    saveRecords: jest.fn(async (auditId: string, records: RewriteRecord[]) => {
      savedRecords.set(auditId, clone(records));
      const bucket = collections.get("accountmergerecords") ?? [];
      bucket.push({ _id: `rec-${auditId}`, auditId });
      collections.set("accountmergerecords", bucket);
    }),
    loadRecords: jest.fn(async (auditId: string) => clone(savedRecords.get(auditId) ?? [])),
  };

  const offerService = {
    take: jest.fn(async (token: string) => {
      const offer = offers.get(token);
      offers.delete(token);
      return offer;
    }),
    store: jest.fn(async (token: string, offer: StoredMergeOffer) => {
      offers.set(token, offer);
    }),
    blockers: jest.fn(async () => options.blockers ?? []),
  };

  const audit = {
    append: jest.fn(async (entry: Omit<(typeof auditRows)[number], "id">) => {
      const id = `audit-${auditRows.length + 1}`;
      auditRows.push({ id, ...clone(entry) } as (typeof auditRows)[number]);
      return id;
    }),
    patchDetails: jest.fn(async (id: string, patch: Doc) => {
      const row = auditRows.find((entry) => entry.id === id)!;
      Object.assign(row.details, clone(patch));
    }),
    findOpenMerges: jest.fn(async (target: string) =>
      auditRows
        .filter(
          (row) =>
            row.action === "account.merge" &&
            row.target === target &&
            row.details.state === "applied" &&
            !row.details.undoneAt,
        )
        .reverse()
        .map((row) => ({ id: row.id, target: row.target, details: row.details })),
    ),
    findAppliedMergeFrom: jest.fn(async (from: string) => {
      const row = auditRows.find(
        (entry) =>
          entry.action === "account.merge" &&
          entry.details.fromAccountId === from &&
          entry.details.state === "applied" &&
          !entry.details.undoneAt,
      );
      return row ? { id: row.id, target: row.target, details: row.details } : null;
    }),
  };

  const service = new AccountMergeService(
    { internal: options.internal ?? true } as unknown as AccountIdentityService,
    userRepository as unknown as UserRepository,
    signIns as unknown as UserSignInRepository,
    userService as unknown as UserService,
    repository as unknown as AccountMergeRepository,
    offerService as unknown as AccountMergeOfferService,
    audit as unknown as AdminAuditRepository,
  );

  function offer(overrides: Partial<StoredMergeOffer> = {}) {
    offers.set(TOKEN, {
      current: CUR,
      other: OTH,
      discordId: DISCORD,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      ...overrides,
    });
  }

  return {
    service,
    users,
    collections,
    signInRows,
    savedRecords,
    auditRows,
    offers,
    invalidated,
    initial,
    userRepository,
    signIns,
    userService,
    repository,
    offerService,
    audit,
    offer,
  };
}

function docs(collections: Collections, name: string): Doc[] {
  return [...(collections.get(name) ?? [])].sort((a, b) =>
    String(a._id).localeCompare(String(b._id)),
  );
}

function withoutRevision(collections: Collections): Doc[] {
  return docs(collections, "plannerplans").map(({ revision: _revision, ...rest }) => rest);
}

function plansOf(collections: Collections, id: string): string[] {
  const doc = collections.get("plannerplans")!.find((entry) => entry._id === id)!;
  return (doc.plans as { draftName: string }[]).map((plan) => plan.draftName);
}

describe("AccountMergeService.merge", () => {
  describe("keeping the current account", () => {
    async function run() {
      const ctx = setup();
      ctx.offer();
      const result = await ctx.service.merge(CUR, TOKEN, "current");
      return { ctx, result };
    }

    it("answers with the kept account as the caller now resolves to it", async () => {
      const { ctx, result } = await run();

      expect(result.user).toEqual({ sub: CUR });
      expect(ctx.userService.getMeConnected).toHaveBeenCalledWith(CUR);
    });

    it("removes the merged-away user row and keeps display name and settings", async () => {
      const { ctx } = await run();

      expect(ctx.users.has(OTH)).toBe(false);
      expect(ctx.users.get(CUR)).toMatchObject({
        displayName: "Google Me",
        settings: { theme: "dark" },
      });
    });

    it("unions roles and fills blank profile fields from the other account", async () => {
      const { ctx } = await run();

      const kept = ctx.users.get(CUR)!;
      expect(kept.roles).toEqual(["dev", "tournament-creator"]);
      expect(kept.profile).toEqual({
        discordName: "typed",
        gameName: "GG",
        timezone: "UTC",
      });
    });

    it("moves the approved Discord onto the kept account", async () => {
      const { ctx } = await run();

      expect(ctx.users.get(CUR)!.discord).toMatchObject({ id: DISCORD, username: "ash" });
    });

    it("points the merged-away account's sign-ins at the kept account", async () => {
      const { ctx } = await run();

      expect([...ctx.signInRows.values()]).toEqual([
        { signIn: DISCORD_SIGN_IN, accountId: CUR, blocked: false },
        { signIn: "auth0|extra", accountId: CUR, blocked: true },
      ]);
      expect(ctx.invalidated).toEqual(
        expect.arrayContaining([DISCORD_SIGN_IN, "auth0|extra"]),
      );
    });

    it("combines planner plans, renaming only a clashing name", async () => {
      const { ctx } = await run();

      expect(plansOf(ctx.collections, "p1")).toEqual(["Main", "Main (2)", "Other"]);
      expect(
        ctx.collections.get("plannerplans")!.find((doc) => doc._id === "p1")!.revision,
      ).toBe(2);
      expect(ctx.collections.get("plannerplans")!.some((doc) => doc._id === "p2")).toBe(
        false,
      );
      expect(
        ctx.collections.get("plannerplans")!.find((doc) => doc._id === "p3"),
      ).toMatchObject({ owner: CUR, key: "plannerData:l/t" });
    });

    it("gives a clashing external draft a free suffixed slug", async () => {
      const { ctx } = await run();

      expect(docs(ctx.collections, "drafts")).toEqual([
        { _id: "d1", owner: CUR, slug: "abc" },
        { _id: "d2", owner: CUR, slug: "abc-2" },
        { _id: "d3", owner: CUR, slug: "xyz" },
      ]);
    });

    it("keeps the kept account's import alias on a clash", async () => {
      const { ctx } = await run();

      expect(docs(ctx.collections, "tierlistimportaliases").map((doc) => doc._id)).toEqual([
        "a1",
        "a3",
      ]);
      expect(
        docs(ctx.collections, "tierlistimportaliases").every((doc) => doc.owner === CUR),
      ).toBe(true);
    });

    it("rewrites every other account id and leaves the skipped collections alone", async () => {
      const { ctx } = await run();

      expect(ctx.collections.get("leagues")![0]).toEqual({
        _id: "l1",
        owner: CUR,
        admins: [{ sub: CUR }, { sub: "other-person" }],
      });
      expect(ctx.collections.get("adminaudits")![0].details).toEqual({ note: OTH });
      expect(
        ctx.collections.get("usersignins")![0].accountId,
      ).toBe(OTH);
    });

    it("writes the audit row and the record of changed documents", async () => {
      const { ctx } = await run();

      const merge = ctx.auditRows[0];
      expect(merge).toMatchObject({
        actor: CUR,
        action: "account.merge",
        target: CUR,
        details: {
          state: "applied",
          keep: "current",
          fromAccountId: OTH,
          toAccountId: CUR,
          discordId: DISCORD,
        },
      });
      expect((merge.details.removedUser as Doc)._id).toBe(OTH);
      const records = ctx.savedRecords.get(merge.id)!;
      expect(records).toEqual(
        expect.arrayContaining([
          { collection: "leagues", id: "l1", paths: ["owner", "admins.0.sub"] },
          { collection: "drafts", id: "d2", paths: ["owner"] },
        ]),
      );
      expect(records.some((record) => record.collection === "adminaudits")).toBe(false);
      expect(ctx.collections.get("accountmergerecords")).toHaveLength(1);
    });
  });

  describe("keeping the other account", () => {
    async function run() {
      const ctx = setup();
      ctx.offer();
      await ctx.service.merge(CUR, TOKEN, "other");
      return ctx;
    }

    it("keeps the other account's display name and settings and removes the current row", async () => {
      const ctx = await run();

      expect(ctx.users.has(CUR)).toBe(false);
      expect(ctx.users.get(OTH)).toMatchObject({
        displayName: "Discord Me",
        settings: { theme: "light" },
      });
    });

    it("unions roles, fills the profile and leaves the Discord it already holds", async () => {
      const ctx = await run();

      const kept = ctx.users.get(OTH)!;
      expect(kept.roles).toEqual(["tournament-creator", "dev"]);
      expect(kept.profile).toEqual({ discordName: "ash", timezone: "UTC", gameName: "GG" });
      expect(kept.discord).toMatchObject({ id: DISCORD });
    });

    it("points the current sign-in at the kept account so the caller resolves to it", async () => {
      const ctx = await run();

      expect(ctx.signInRows.get(GOOGLE_SIGN_IN)).toEqual({
        signIn: GOOGLE_SIGN_IN,
        accountId: OTH,
        blocked: false,
      });
      expect(ctx.signInRows.get(DISCORD_SIGN_IN)!.accountId).toBe(OTH);
      expect(ctx.userService.getMeConnected).toHaveBeenCalledWith(OTH);
    });

    it("moves the current account's data to the kept one", async () => {
      const ctx = await run();

      expect(docs(ctx.collections, "drafts")).toEqual([
        { _id: "d1", owner: OTH, slug: "abc-2" },
        { _id: "d2", owner: OTH, slug: "abc" },
        { _id: "d3", owner: OTH, slug: "xyz" },
      ]);
      expect(plansOf(ctx.collections, "p2")).toEqual(["Main", "Other", "Main (2)"]);
      expect(ctx.auditRows[0].target).toBe(OTH);
    });
  });

  it("gives the kept account a Discord built from the offer when the other row only had it as a sign-in", async () => {
    const ctx = setup();
    delete ctx.users.get(OTH)!.discord;
    ctx.offer();

    await ctx.service.merge(CUR, TOKEN, "current");

    expect(ctx.users.get(CUR)!.discord).toMatchObject({ id: DISCORD, username: "ash" });
  });

  describe("misuse", () => {
    it("is unavailable outside internal mode and leaves the token alone", async () => {
      const ctx = setup({ internal: false });
      ctx.offer();

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-029",
        status: 503,
      });
      expect(ctx.offers.has(TOKEN)).toBe(true);
      expect(ctx.audit.append).not.toHaveBeenCalled();
    });

    it("refuses a token nobody issued", async () => {
      const ctx = setup();

      await expect(ctx.service.merge(CUR, "nope", "current")).rejects.toMatchObject({
        code: "USR-028",
        status: 400,
      });
    });

    it("refuses a token another account received", async () => {
      const ctx = setup();
      ctx.offer();

      await expect(ctx.service.merge(ADMIN, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-028",
      });
      expect(ctx.audit.append).not.toHaveBeenCalled();
    });

    it("refuses an expired token", async () => {
      const ctx = setup();
      ctx.offer({ expiresAt: new Date(Date.now() - 1000).toISOString() });

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-028",
      });
    });

    it("refuses a token used twice", async () => {
      const ctx = setup();
      ctx.offer();
      await ctx.service.merge(CUR, TOKEN, "current");

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-028",
      });
    });

    it("refuses when the Discord no longer belongs to the other account", async () => {
      const ctx = setup();
      ctx.offer({ discordId: "999999999999999999" });

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-028",
      });
      expect(ctx.audit.append).not.toHaveBeenCalled();
    });

    it("refuses when an account has gone", async () => {
      const ctx = setup();
      ctx.offer();
      ctx.users.delete(CUR);

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-028",
      });
    });

    it("rechecks blockers, names them, writes nothing and keeps the token usable", async () => {
      const ctx = setup({ blockers: ["Both accounts are in Spring Cup."] });
      ctx.offer();

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toMatchObject({
        code: "USR-030",
        status: 409,
        details: { blockers: ["Both accounts are in Spring Cup."] },
      });
      expect(ctx.audit.append).not.toHaveBeenCalled();
      expect(ctx.offers.has(TOKEN)).toBe(true);
      expect(ctx.users.has(OTH)).toBe(true);
      expect(ctx.initial.collections).toEqual(ctx.collections);
    });
  });

  describe("failing midway", () => {
    it("puts everything back and records the failure", async () => {
      const ctx = setup({ failOnRepoint: 2 });
      ctx.offer();

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toThrow("db down");

      expect(ctx.users).toEqual(ctx.initial.users);
      expect(ctx.signInRows).toEqual(ctx.initial.signIns);
      for (const name of [
        "drafts",
        "tierlistimportaliases",
        "leagues",
        "adminaudits",
        "usersignins",
      ]) {
        expect(docs(ctx.collections, name)).toEqual(docs(ctx.initial.collections, name));
      }
      expect(withoutRevision(ctx.collections)).toEqual(
        withoutRevision(ctx.initial.collections),
      );
      expect(ctx.auditRows[0].details).toMatchObject({
        state: "failed",
        failure: "db down",
        notReversed: [],
      });
    });

    it("rolls back when the account ids cannot be rewritten", async () => {
      const ctx = setup();
      ctx.collections.set("weird", [{ _id: "w", [OTH]: true }]);
      ctx.initial.collections.set("weird", [{ _id: "w", [OTH]: true }]);
      ctx.offer();

      await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toThrow(
        /cannot be rewritten/,
      );

      expect(ctx.users).toEqual(ctx.initial.users);
      expect(withoutRevision(ctx.collections)).toEqual(
        withoutRevision(ctx.initial.collections),
      );
      expect(docs(ctx.collections, "drafts")).toEqual(
        docs(ctx.initial.collections, "drafts"),
      );
      expect(ctx.auditRows[0].details.state).toBe("failed");
    });
  });
});

describe("AccountMergeService applications", () => {
  function app(id: string, owner: string, status: string, extra: Doc = {}): Doc {
    return { _id: id, auth0Id: owner, tournamentId: "t1", status, ...extra };
  }

  function withApps(apps: Doc[]) {
    const ctx = setup();
    ctx.collections.set("tournamentapplications", clone(apps));
    ctx.initial.collections.set("tournamentapplications", clone(apps));
    ctx.offer();
    return ctx;
  }

  function ownerAndStatus(ctx: ReturnType<typeof setup>) {
    return docs(ctx.collections, "tournamentapplications").map((doc) => [
      doc._id,
      doc.auth0Id,
    ]);
  }

  it("keeps the seated application of the merged-away account and deletes the kept account's pending one", async () => {
    const ctx = withApps([
      app("k", CUR, "pending"),
      app("a", OTH, "approved", { resultingCoachId: "c1" }),
    ]);

    await ctx.service.merge(CUR, TOKEN, "current");

    expect(ownerAndStatus(ctx)).toEqual([["a", CUR]]);
  });

  it("keeps the seated application of the kept account and deletes the other pending one", async () => {
    const ctx = withApps([
      app("k", CUR, "approved"),
      app("a", OTH, "pending"),
    ]);

    await ctx.service.merge(CUR, TOKEN, "current");

    expect(ownerAndStatus(ctx)).toEqual([["k", CUR]]);
  });

  it("keeps the kept side's application when both are pending or both are seated", async () => {
    const pending = withApps([app("k", CUR, "pending"), app("a", OTH, "pending")]);
    await pending.service.merge(CUR, TOKEN, "current");
    expect(ownerAndStatus(pending)).toEqual([["k", CUR]]);

    const seated = withApps([app("k", CUR, "approved"), app("a", OTH, "approved")]);
    await seated.service.merge(CUR, TOKEN, "other");
    expect(ownerAndStatus(seated)).toEqual([["a", OTH]]);
  });

  it("leaves applications to different tournaments alone and rewrites their owner", async () => {
    const ctx = withApps([
      app("k", CUR, "pending"),
      app("a", OTH, "pending", { tournamentId: "t2" }),
    ]);

    await ctx.service.merge(CUR, TOKEN, "current");

    expect(ownerAndStatus(ctx)).toEqual([
      ["a", CUR],
      ["k", CUR],
    ]);
  });

  it("restores the deleted application on undo", async () => {
    const ctx = withApps([
      app("k", CUR, "pending"),
      app("a", OTH, "approved", { resultingCoachId: "c1" }),
    ]);
    await ctx.service.merge(CUR, TOKEN, "current");

    await ctx.service.undo(ADMIN, CUR, "n");

    expect(docs(ctx.collections, "tournamentapplications")).toEqual(
      docs(ctx.initial.collections, "tournamentapplications"),
    );
  });

  it("restores the deleted application when the merge fails", async () => {
    const ctx = withApps([app("k", CUR, "pending"), app("a", OTH, "pending")]);
    ctx.signIns.repoint.mockRejectedValue(new Error("db down"));

    await expect(ctx.service.merge(CUR, TOKEN, "current")).rejects.toThrow("db down");

    expect(docs(ctx.collections, "tournamentapplications")).toEqual(
      docs(ctx.initial.collections, "tournamentapplications"),
    );
  });
});

describe("AccountMergeService.undo", () => {
  async function merged(keep: "current" | "other") {
    const ctx = setup();
    ctx.offer();
    await ctx.service.merge(CUR, TOKEN, keep);
    return ctx;
  }

  it.each(["current", "other"] as const)(
    "puts back ids, rows, sign-ins and combines after keeping the %s account",
    async (keep) => {
      const ctx = await merged(keep);
      const keptId = keep === "current" ? CUR : OTH;

      await expect(ctx.service.undo(ADMIN, keptId, "wrong people")).resolves.toEqual({
        undone: true,
      });

      expect(ctx.users).toEqual(ctx.initial.users);
      expect(ctx.signInRows).toEqual(ctx.initial.signIns);
      for (const name of [
        "drafts",
        "tierlistimportaliases",
        "leagues",
        "adminaudits",
        "usersignins",
      ]) {
        expect(docs(ctx.collections, name)).toEqual(docs(ctx.initial.collections, name));
      }
      for (const id of ["p1", "p2", "p3"]) {
        const before = ctx.initial.collections
          .get("plannerplans")!
          .find((doc) => doc._id === id)!;
        const after = ctx.collections.get("plannerplans")!.find((doc) => doc._id === id)!;
        expect({ owner: after.owner, key: after.key, plans: after.plans }).toEqual({
          owner: before.owner,
          key: before.key,
          plans: before.plans,
        });
      }
    },
  );

  it("records the undo, marks the merge undone and leaves nothing more to undo", async () => {
    const ctx = await merged("current");

    await ctx.service.undo(ADMIN, CUR, "wrong people");

    expect(ctx.auditRows[1]).toMatchObject({
      actor: ADMIN,
      action: "account.merge-undo",
      target: CUR,
      details: { note: "wrong people", mergeAudit: ctx.auditRows[0].id, notReversed: [] },
    });
    expect(ctx.auditRows[0].details).toMatchObject({ undoneBy: ADMIN });
    await expect(ctx.service.undo(ADMIN, CUR, "again")).rejects.toMatchObject({
      code: "USR-018",
    });
  });

  it("leaves data created after the merge with the kept account", async () => {
    const ctx = await merged("current");
    ctx.collections.get("leagues")!.push({ _id: "l9", owner: CUR, admins: [] });
    ctx.users.get(CUR)!.displayName = "Renamed";

    await ctx.service.undo(ADMIN, CUR, "n");

    expect(ctx.collections.get("leagues")!.find((doc) => doc._id === "l9")!.owner).toBe(CUR);
    expect(ctx.users.get(CUR)!.displayName).toBe("Renamed");
  });

  it("does not take back a value that changed after the merge", async () => {
    const ctx = await merged("current");
    ctx.collections.get("leagues")![0].owner = "someone-else";

    await ctx.service.undo(ADMIN, CUR, "n");

    expect(ctx.collections.get("leagues")![0].owner).toBe("someone-else");
    expect((ctx.collections.get("leagues")![0].admins as Doc[])[0].sub).toBe(OTH);
  });

  it("reports merged-in plans that were edited and cannot be removed", async () => {
    const ctx = await merged("current");
    const kept = ctx.collections.get("plannerplans")!.find((doc) => doc._id === "p1")!;
    (kept.plans as Doc[])[1].draftName = "Edited";

    await ctx.service.undo(ADMIN, CUR, "n");

    expect(ctx.auditRows[1].details.notReversed).toEqual([
      expect.stringContaining("1 merged-in plan(s)"),
    ]);
  });

  it("refuses when nothing was merged into the account", async () => {
    const ctx = setup();

    await expect(ctx.service.undo(ADMIN, CUR, "n")).rejects.toMatchObject({
      code: "USR-018",
      status: 404,
    });
    expect(ctx.audit.append).not.toHaveBeenCalled();
  });

  it("refuses when the old account id is in use again", async () => {
    const ctx = await merged("current");
    ctx.users.set(OTH, { _id: OTH, auth0Sub: "new-sign-in" });

    await expect(ctx.service.undo(ADMIN, CUR, "n")).rejects.toMatchObject({
      code: "USR-031",
      status: 409,
    });
    expect(ctx.audit.append).toHaveBeenCalledTimes(1);
  });
});

describe("AccountMergeService.keptProfileFor", () => {
  it("resolves a merged-away profile id to the kept account", async () => {
    const ctx = setup();
    ctx.offer();
    await ctx.service.merge(CUR, TOKEN, "current");

    await expect(ctx.service.keptProfileFor(OTH)).resolves.toBe(CUR);
  });

  it("follows a chain of merges", async () => {
    const ctx = setup();
    ctx.offer();
    await ctx.service.merge(CUR, TOKEN, "current");
    ctx.auditRows.push({
      id: "audit-chain",
      actor: CUR,
      action: "account.merge",
      target: ADMIN,
      details: { state: "applied", fromAccountId: CUR },
    });

    await expect(ctx.service.keptProfileFor(OTH)).resolves.toBe(ADMIN);
  });

  it("answers null for an id that was never merged or is not an id", async () => {
    const ctx = setup();

    await expect(ctx.service.keptProfileFor(OTH)).resolves.toBeNull();
    await expect(ctx.service.keptProfileFor("nobody")).resolves.toBeNull();
    await expect(ctx.service.keptProfileFor(undefined)).resolves.toBeNull();
  });

  it("stops redirecting once the merge is undone", async () => {
    const ctx = setup();
    ctx.offer();
    await ctx.service.merge(CUR, TOKEN, "current");
    await ctx.service.undo(ADMIN, CUR, "n");

    await expect(ctx.service.keptProfileFor(OTH)).resolves.toBeNull();
  });
});
