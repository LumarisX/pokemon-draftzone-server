import { AppCacheService } from "@core/cache/app-cache.service";
import { createCache } from "cache-manager";
import { AccountIdentityService } from "./account-identity.service";
import { AccountMergeOfferService } from "./account-merge-offer.service";
import { AccountMergeRepository } from "./account-merge.repository";
import { AccountRecord, UserRepository } from "./user.repository";

const CURRENT = "a1a1a1a1a1a1a1a1a1a1a1a1";
const OTHER = "b2b2b2b2b2b2b2b2b2b2b2b2";
const DISCORD = "123456789012345678";

function record(overrides: Partial<AccountRecord>): AccountRecord {
  return {
    accountId: CURRENT,
    profileId: CURRENT,
    signIn: "google-oauth2|1",
    displayName: "Google Me",
    profile: null,
    settings: null,
    privateProfile: false,
    roles: [],
    joined: new Date("2025-03-01T00:00:00.000Z"),
    lastLogin: new Date("2026-11-01"),
    ...overrides,
  };
}

function setup(internal = true) {
  const accounts: Record<string, AccountRecord> = {
    [CURRENT]: record({}),
    [OTHER]: record({
      accountId: OTHER,
      profileId: OTHER,
      signIn: `oauth2|discord|${DISCORD}`,
      displayName: "Discord Me",
      joined: new Date("2024-01-01T00:00:00.000Z"),
    }),
  };
  const users = {
    findAccountByProfileId: jest.fn(async (id: string) => accounts[id] ?? null),
  };
  const participants: Record<string, string[]> = { [CURRENT]: [], [OTHER]: [] };
  const staff: Record<string, string[]> = { [CURRENT]: [], [OTHER]: [] };
  const live: Record<string, string[]> = { [CURRENT]: [], [OTHER]: [] };
  const plans: Record<string, Map<string, number>> = {
    [CURRENT]: new Map(),
    [OTHER]: new Map(),
  };
  const repository = {
    planCounts: jest.fn(async (id: string) => plans[id]),
    counts: jest.fn(async (id: string) => ({
      teams: id === CURRENT ? 2 : 0,
      leagues: 1,
      tournaments: 3,
      drafts: 4,
      tierLists: 5,
      plans: 6,
    })),
    participantTournaments: jest.fn(async (id: string) => participants[id]),
    staffTournaments: jest.fn(async (id: string) => staff[id]),
    liveDraftTournaments: jest.fn(async (id: string) => live[id]),
    tournamentNames: jest.fn(
      async (ids: string[]) =>
        new Map(ids.map((id) => [id, id === "t1" ? "Spring Cup" : "Fall Cup"])),
    ),
  };
  const cache = new AppCacheService(createCache());
  const service = new AccountMergeOfferService(
    { internal } as unknown as AccountIdentityService,
    users as unknown as UserRepository,
    repository as unknown as AccountMergeRepository,
    cache,
  );
  return { service, repository, participants, staff, live, plans, cache, users };
}

describe("AccountMergeOfferService", () => {
  it("makes no offer in auth0 mode", async () => {
    const ctx = setup(false);

    await expect(ctx.service.create(CURRENT, OTHER, DISCORD)).resolves.toBeNull();
    expect(ctx.repository.counts).not.toHaveBeenCalled();
  });

  it("describes both accounts with their counts and how they sign in", async () => {
    const ctx = setup();

    const offer = await ctx.service.create(CURRENT, OTHER, DISCORD);

    expect(offer).toMatchObject({
      blockers: [],
      current: {
        profileId: CURRENT,
        displayName: "Google Me",
        joined: "2025-03-01T00:00:00.000Z",
        signInMethod: "google",
        counts: {
          teams: 2,
          leagues: 1,
          tournaments: 3,
          drafts: 4,
          tierLists: 5,
          plans: 6,
        },
      },
      other: {
        profileId: OTHER,
        displayName: "Discord Me",
        signInMethod: "discord",
      },
    });
    expect(Object.keys(offer!.current).sort()).toEqual([
      "counts",
      "displayName",
      "joined",
      "profileId",
      "signInMethod",
    ]);
  });

  it("keeps the token for ten minutes, bound to both accounts and the Discord, single use", async () => {
    const ctx = setup();
    const before = Date.now();

    const offer = await ctx.service.create(CURRENT, OTHER, DISCORD);

    const remaining = new Date(offer!.expiresAt).getTime() - before;
    expect(remaining).toBeGreaterThan(9 * 60_000);
    expect(remaining).toBeLessThanOrEqual(10 * 60_000 + 1000);
    const taken = await ctx.service.take(offer!.token);
    expect(taken).toEqual({
      current: CURRENT,
      other: OTHER,
      discordId: DISCORD,
      expiresAt: offer!.expiresAt,
    });
    await expect(ctx.service.take(offer!.token)).resolves.toBeUndefined();
  });

  it("makes no offer when an account cannot be found", async () => {
    const ctx = setup();

    await expect(
      ctx.service.create(CURRENT, "c3c3c3c3c3c3c3c3c3c3c3c3", DISCORD),
    ).resolves.toBeNull();
  });

  it("blocks when both accounts coach in or applied to the same tournament", async () => {
    const ctx = setup();
    ctx.participants[CURRENT] = ["t1", "t2"];
    ctx.participants[OTHER] = ["t1"];

    const offer = await ctx.service.create(CURRENT, OTHER, DISCORD);

    expect(offer!.blockers).toEqual(["Both accounts are in Spring Cup."]);
  });

  it("blocks when both accounts hold a staff seat in the same tournament", async () => {
    const ctx = setup();
    ctx.staff[CURRENT] = ["t2"];
    ctx.staff[OTHER] = ["t2", "t3"];

    const offer = await ctx.service.create(CURRENT, OTHER, DISCORD);

    expect(offer!.blockers).toEqual([
      "Both accounts hold a staff seat in Fall Cup.",
    ]);
  });

  it("blocks while either account is coaching in a draft in progress", async () => {
    const ctx = setup();
    ctx.live[OTHER] = ["t1"];

    const offer = await ctx.service.create(CURRENT, OTHER, DISCORD);

    expect(offer!.blockers).toEqual([
      "A draft is running in Spring Cup and one of these accounts is coaching in it.",
    ]);
  });

  it("blocks when one planner would hold more plans than it can", async () => {
    const ctx = setup();
    ctx.plans[CURRENT] = new Map([
      ["plannerData", 6],
      ["plannerData:pdbl/s4", 2],
    ]);
    ctx.plans[OTHER] = new Map([
      ["plannerData", 5],
      ["plannerData:pdbl/s4", 2],
    ]);

    await expect(ctx.service.blockers(CURRENT, OTHER)).resolves.toEqual([
      "Together these accounts have 11 plans in the free planner, and a planner holds 9. Delete 2 first.",
    ]);
  });

  it("does not block on tournaments only one account is in", async () => {
    const ctx = setup();
    ctx.participants[CURRENT] = ["t1"];
    ctx.participants[OTHER] = ["t2"];
    ctx.staff[CURRENT] = ["t3"];

    await expect(ctx.service.blockers(CURRENT, OTHER)).resolves.toEqual([]);
  });

  it("does not store an offer that has already expired", async () => {
    const ctx = setup();

    await ctx.service.store("old", {
      current: CURRENT,
      other: OTHER,
      discordId: DISCORD,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(ctx.service.take("old")).resolves.toBeUndefined();
  });
});
