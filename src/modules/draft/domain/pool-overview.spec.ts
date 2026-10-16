import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
} from "@modules/tier-list/tier-list.domain";
import { Types } from "mongoose";
import { tierId } from "../../tier-list/tier-list.test-ids";
import { isTournamentMember, summarizePool } from "./pool-overview";

function buildTierList() {
  return new TierList({
    id: "tierlist-1",
    slug: "tierlist1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tierId: tierId("S") })],
      ["charizard", new TierListPokemon({ name: "Charizard", tierId: tierId("S") })],
      ["bulbasaur", new TierListPokemon({ name: "Bulbasaur", tierId: tierId("A") })],
    ]),
    tiers: [
      new Tier({ id: tierId("S"), name: "S", cost: 10 }),
      new Tier({ id: tierId("A"), name: "A", cost: 5 }),
    ],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
  });
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    owner: "auth0|owner",
    staff: [],
    tierList: buildTierList(),
    draftCount: new DraftCount({ min: 1, max: 2 }),
    ...overrides,
  } as any;
}

function pick(id: string, minute: number, second = 0) {
  return {
    pokemon: { id },
    timestamp: new Date(Date.UTC(2026, 9, 1, 0, minute, second)),
  };
}

function buildTeam(name: string, auth0Id: string, pickLog: unknown[] = []) {
  return {
    _id: new Types.ObjectId(),
    slug: name.toLowerCase(),
    teamName: name,
    logo: `${name}-logo`,
    status: "approved",
    pickLog,
    picks: [],
    coaches: [{ _id: new Types.ObjectId(), auth0Id }],
  } as any;
}

function buildDraft(teams: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    slug: "defense",
    name: "Defense",
    status: "IN_PROGRESS",
    sequentialTurns: true,
    orderProgression: "snake",
    useRandomSeeding: false,
    teamOrder: (teams as { _id: Types.ObjectId }[]).map((team) => team._id),
    counter: 0,
    noTimer: false,
    eventLog: [],
    picksVisibleTo: "everyone",
    allowDuplicates: false,
    public: true,
    teams,
    ...overrides,
  } as any;
}

describe("summarizePool", () => {
  it("measures progress in turns, so a skipped turn still moves the draft along", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [pick("pikachu", 0)]);
    const beta = buildTeam("Beta", "auth0|beta");
    const gamma = buildTeam("Gamma", "auth0|gamma");
    const draft = buildDraft([alpha, beta, gamma], { counter: 2 });

    const result = summarizePool(buildTournament(), draft, "auth0|alpha");

    expect(result.progress).toEqual({ done: 2, total: 6 });
    expect(result.currentRound).toBe(0);
    expect(result.onTheClock?.name).toBe("Gamma");
    expect(result.yourTeam?.name).toBe("Alpha");
    expect(result.yourPickIn).toBe(3);
  });

  it("lists recent picks newest first while the draft is live", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [pick("pikachu", 0)]);
    const beta = buildTeam("Beta", "auth0|beta", [pick("charizard", 10)]);
    const draft = buildDraft([alpha, beta], { counter: 2 });

    const result = summarizePool(buildTournament(), draft, undefined);

    expect(result.recentPicks.map((p) => p.pokemon.id)).toEqual([
      "charizard",
      "pikachu",
    ]);
    expect(result.recentPicks[0].team.logo).toBe("Beta-logo");
    expect(result.recentPicks[0].round).toBe(0);
  });

  it("shows a completed draft as fully done and keeps its recent picks", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [pick("pikachu", 0)]);
    const beta = buildTeam("Beta", "auth0|beta", [pick("charizard", 10)]);
    const draft = buildDraft([alpha, beta], { status: "COMPLETED", counter: 3 });

    const result = summarizePool(buildTournament(), draft, undefined);

    expect(result.recentPicks.map((p) => p.pokemon.id)).toEqual([
      "charizard",
      "pikachu",
    ]);
    expect(result.progress).toEqual({ done: 4, total: 4 });
    expect(result.onTheClock).toBeUndefined();
    expect(result.completedAt).toEqual(new Date(Date.UTC(2026, 9, 1, 0, 10)));
  });

  it("shows a pool that has not started as empty", () => {
    const draft = buildDraft([buildTeam("Alpha", "auth0|alpha")], {
      status: "PRE_DRAFT",
    });

    expect(
      summarizePool(buildTournament(), draft, undefined).progress,
    ).toEqual({ done: 0, total: 2 });
  });

  it("hides picks in a blind draft", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [pick("pikachu", 0)]);
    const draft = buildDraft([alpha], { picksVisibleTo: "ownTeam" });

    const result = summarizePool(buildTournament(), draft, "auth0|someone");

    expect(result.picksHidden).toBe(true);
    expect(result.recentPicks).toEqual([]);
  });

  it("measures pace from the median gap between picks and reports snipes", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [
      pick("pikachu", 0),
      pick("bulbasaur", 600),
    ]);
    const beta = buildTeam("Beta", "auth0|beta", [pick("charizard", 4)]);
    const draft = buildDraft([alpha, beta], {
      status: "COMPLETED",
      snipeCount: 3,
    });

    const result = summarizePool(buildTournament(), draft, undefined);

    expect(result.pace).toEqual({
      medianPickSeconds: Math.round((4 * 60 + 596 * 60) / 2),
      snipes: 3,
    });
  });

  it("ignores instant queued picks when measuring pace", () => {
    const alpha = buildTeam("Alpha", "auth0|alpha", [
      pick("pikachu", 0),
      pick("bulbasaur", 30),
    ]);
    const beta = buildTeam("Beta", "auth0|beta", [
      pick("charizard", 10),
      pick("mewtwo", 10, 1),
    ]);
    const draft = buildDraft([alpha, beta]);

    expect(
      summarizePool(buildTournament(), draft, undefined).pace
        .medianPickSeconds,
    ).toBe(15 * 60);
  });

  it("leaves pace out when the pick times were written in bulk", () => {
    const at = Date.UTC(2026, 2, 9);
    const bulk = (id: string, ms: number) => ({
      pokemon: { id },
      timestamp: new Date(at + ms),
    });
    const alpha = buildTeam("Alpha", "auth0|alpha", [
      bulk("pikachu", 0),
      bulk("bulbasaur", 300),
    ]);
    const beta = buildTeam("Beta", "auth0|beta", [
      bulk("charizard", 150),
      { pokemon: { id: "mewtwo" }, timestamp: new Date(Date.UTC(2026, 1, 19)) },
    ]);
    const draft = buildDraft([alpha, beta], { status: "COMPLETED" });

    expect(
      summarizePool(buildTournament(), draft, undefined).pace
        .medianPickSeconds,
    ).toBeUndefined();
  });

  it("treats legacy statuses as pre-draft", () => {
    const draft = buildDraft([buildTeam("Alpha", "auth0|alpha")], {
      status: "NOT_STARTED",
    });

    expect(summarizePool(buildTournament(), draft, undefined).status).toBe(
      "PRE_DRAFT",
    );
  });
});

describe("isTournamentMember", () => {
  it("counts staff and coaches of approved teams", () => {
    const tournament = buildTournament({
      staff: [{ sub: "auth0|organizer", role: "organizer" }],
    });
    const teams = [
      buildTeam("Alpha", "auth0|alpha"),
      { ...buildTeam("Pending", "auth0|pending"), status: "pending" },
    ];

    expect(isTournamentMember(tournament, teams, "auth0|organizer")).toBe(true);
    expect(isTournamentMember(tournament, teams, "auth0|alpha")).toBe(true);
    expect(isTournamentMember(tournament, teams, "auth0|pending")).toBe(false);
    expect(isTournamentMember(tournament, teams, "auth0|stranger")).toBe(false);
    expect(isTournamentMember(tournament, teams, undefined)).toBe(false);
  });
});
