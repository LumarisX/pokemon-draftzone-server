import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
} from "@modules/tier-list/tier-list.domain";
import { Types } from "mongoose";
import {
  areAddonsValid,
  canBeDrafted,
  canBeDraftedWithReason,
  createPokemonTierMap,
  getPickCost,
  getTeamPoints,
  isDraftComplete,
  isTeamDoneDrafting,
  teamHasEnoughPoints,
} from "./tier-cost";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      [
        "charizard",
        new TierListPokemon({
          name: "Charizard",
          tier: "A",
          addons: [new TierListPokemonAddon({ name: "Tera Captain", cost: 2 })],
        }),
      ],
    ]),
    tiers: [new Tier({ name: "S", cost: 10 }), new Tier({ name: "A", cost: 5 })],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

function buildTournament(
  tierList: TierList,
  overrides: Record<string, unknown> = {},
) {
  return {
    tierList,
    draftCount: new DraftCount({ min: 1, max: 6 }),
    pointTotal: undefined,
    tierRequirements: [],
    ...overrides,
  } as any;
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    pickLog: [],
    ...overrides,
  } as any;
}

function buildDraft(overrides: Record<string, unknown> = {}) {
  return {
    counter: 0,
    teams: [],
    ...overrides,
  } as any;
}

describe("createPokemonTierMap", () => {
  it("maps each tracked Pokemon to its tier name", () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);

    const map = createPokemonTierMap(tournament);

    expect(map.get("pikachu")).toBe("S");
    expect(map.get("charizard")).toBe("A");
  });
});

describe("getPickCost", () => {
  it("returns the tier's cost when no addons are selected", () => {
    const tierList = buildTierList();

    expect(getPickCost(tierList, { pokemonId: "pikachu" })).toBe(10);
  });

  it("returns 0 for a Pokemon the tier list doesn't track", () => {
    const tierList = buildTierList();

    expect(getPickCost(tierList, { pokemonId: "mew" })).toBe(0);
  });

  it("returns 0 when the Pokemon's tier name doesn't match any real tier", () => {
    const tierList = buildTierList({
      pokemon: new Map([["pikachu", new TierListPokemon({ name: "Pikachu", tier: "Untiered" })]]),
    });

    expect(getPickCost(tierList, { pokemonId: "pikachu" })).toBe(0);
  });

  describe("with addons selected", () => {
    it("adds the addon's cost on top of the base tier cost", () => {
      const tierList = buildTierList();

      const cost = getPickCost(tierList, {
        pokemonId: "charizard",
        addons: ["Tera Captain"],
      });

      // Charizard's tier (A) costs 5, and Tera Captain costs 2.
      expect(cost).toBe(7);
    });

    it("falls back to just the base cost if the selected addon doesn't actually exist for that Pokemon", () => {
      const tierList = buildTierList();

      const cost = getPickCost(tierList, {
        pokemonId: "charizard",
        addons: ["Nonexistent Addon"],
      });

      expect(cost).toBe(5);
    });
  });
});

describe("areAddonsValid", () => {
  it("is valid when no addons are selected", () => {
    const tierList = buildTierList();

    expect(areAddonsValid(tierList, { pokemonId: "pikachu" } as any)).toBe(true);
  });

  it("is invalid when the Pokemon supports no addons at all", () => {
    const tierList = buildTierList();

    expect(
      areAddonsValid(tierList, { pokemonId: "pikachu", addons: ["Tera Captain"] } as any),
    ).toBe(false);
  });

  it("is invalid when an addon name doesn't match any of the Pokemon's real addons", () => {
    const tierList = buildTierList();

    expect(
      areAddonsValid(tierList, { pokemonId: "charizard", addons: ["Fake Addon"] } as any),
    ).toBe(false);
  });

  it("is invalid when the same addon is selected more than once", () => {
    const tierList = buildTierList();

    expect(
      areAddonsValid(tierList, {
        pokemonId: "charizard",
        addons: ["Tera Captain", "Tera Captain"],
      } as any),
    ).toBe(false);
  });

  it("is valid when every selected addon is real and unique", () => {
    const tierList = buildTierList();

    expect(
      areAddonsValid(tierList, { pokemonId: "charizard", addons: ["Tera Captain"] } as any),
    ).toBe(true);
  });
});

describe("getTeamPoints", () => {
  it("sums the pick cost across the team's full pick log", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);
    const team = buildTeam({
      pickLog: [
        { pokemon: { id: "pikachu" } },
        { pokemon: { id: "charizard" } },
      ],
    });

    await expect(getTeamPoints(tournament, team)).resolves.toBe(15);
  });

  it("returns 0 for a team with no picks", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);
    const team = buildTeam();

    await expect(getTeamPoints(tournament, team)).resolves.toBe(0);
  });
});

describe("teamHasEnoughPoints", () => {
  it("returns false for a Pokemon the tier list doesn't track at all", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);
    const draft = buildDraft();
    const team = buildTeam();

    await expect(
      teamHasEnoughPoints(tournament, draft, team, { pokemonId: "mew" } as any),
    ).resolves.toBe(false);
  });

  it("returns true (no budget constraint) when the tournament has no pointTotal", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);
    const draft = buildDraft();
    const team = buildTeam();

    await expect(
      teamHasEnoughPoints(tournament, draft, team, { pokemonId: "pikachu" } as any),
    ).resolves.toBe(true);
  });

  it("allows spending up to the budget minus what must be reserved for remaining minimum picks", async () => {
    // pointTotal 20, draftCount.min 4, no picks yet (this is pick #1):
    // pickCeiling = 20 + 1 - max(4, 1) = 17.
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 17 })],
    });
    const tournament = buildTournament(tierList, {
      pointTotal: 20,
      draftCount: new DraftCount({ min: 4, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam();

    await expect(
      teamHasEnoughPoints(tournament, draft, team, { pokemonId: "pikachu" } as any),
    ).resolves.toBe(true);
  });

  it("rejects a pick that would exceed the reserved-for-minimum-picks ceiling", async () => {
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 18 })],
    });
    const tournament = buildTournament(tierList, {
      pointTotal: 20,
      draftCount: new DraftCount({ min: 4, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam();

    await expect(
      teamHasEnoughPoints(tournament, draft, team, { pokemonId: "pikachu" } as any),
    ).resolves.toBe(false);
  });

  it("stops reserving budget once the minimum pick count has already been met", async () => {
    // 4 existing picks already meets draftCount.min (4); this 5th pick can
    // use the full remaining budget without reservation.
    const tierList = buildTierList({
      tiers: [new Tier({ name: "S", cost: 16 })],
    });
    const tournament = buildTournament(tierList, {
      pointTotal: 20,
      draftCount: new DraftCount({ min: 4, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam({
      pickLog: [
        { pokemon: { id: "0" } }, { pokemon: { id: "1" } },
        { pokemon: { id: "2" } }, { pokemon: { id: "3" } },
      ],
    });

    await expect(
      teamHasEnoughPoints(tournament, draft, team, { pokemonId: "pikachu" } as any),
    ).resolves.toBe(true);
  });
});

describe("canBeDrafted / canBeDraftedWithReason", () => {
  function setup() {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList);
    const draft = buildDraft({ teams: [] });
    const team = buildTeam();
    return { tierList, tournament, draft, team };
  }

  it("rejects an empty/whitespace pokemonId", async () => {
    const { tournament, draft, team } = setup();

    await expect(
      canBeDrafted(tournament, draft, team, { pokemonId: "   " } as any),
    ).resolves.toBe(false);
    await expect(
      canBeDraftedWithReason(tournament, draft, team, { pokemonId: "" } as any),
    ).resolves.toEqual({ canDraft: false, reason: "Invalid Pokemon ID" });
  });

  it("rejects an invalid addon selection", async () => {
    const { tournament, draft, team } = setup();
    const pick = { pokemonId: "pikachu", addons: ["Tera Captain"] } as any;

    await expect(canBeDrafted(tournament, draft, team, pick)).resolves.toBe(false);
    await expect(canBeDraftedWithReason(tournament, draft, team, pick)).resolves.toEqual({
      canDraft: false,
      reason: "Invalid addon selection for this Pokemon",
    });
  });

  it("rejects a Pokemon another team has already drafted", async () => {
    const { tournament, team } = setup();
    const otherTeam = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
    const draft = buildDraft({ teams: [otherTeam] });
    const pick = { pokemonId: "pikachu" } as any;

    await expect(canBeDrafted(tournament, draft, team, pick)).resolves.toBe(false);
    await expect(canBeDraftedWithReason(tournament, draft, team, pick)).resolves.toEqual({
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    });
  });

  it("rejects a pick the team can't afford", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, {
      pointTotal: 5,
      draftCount: new DraftCount({ min: 1, max: 1 }),
    });
    const draft = buildDraft({ teams: [] });
    const team = buildTeam();
    const pick = { pokemonId: "pikachu" } as any; // costs 10, budget is 5

    await expect(canBeDrafted(tournament, draft, team, pick)).resolves.toBe(false);
    await expect(canBeDraftedWithReason(tournament, draft, team, pick)).resolves.toEqual({
      canDraft: false,
      reason: "Team does not have enough points to draft this Pokemon",
    });
  });

  it("allows a valid, affordable, undrafted, addon-free pick", async () => {
    const { tournament, draft, team } = setup();
    const pick = { pokemonId: "pikachu" } as any;

    await expect(canBeDrafted(tournament, draft, team, pick)).resolves.toBe(true);
    await expect(canBeDraftedWithReason(tournament, draft, team, pick)).resolves.toEqual({
      canDraft: true,
    });
  });
});

describe("isTeamDoneDrafting", () => {
  it("is done once pickLog reaches draftCount.max", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, { draftCount: new DraftCount({ min: 1, max: 2 }) });
    const draft = buildDraft();
    const team = buildTeam({
      pickLog: [{ pokemon: { id: "pikachu" } }, { pokemon: { id: "charizard" } }],
    });

    await expect(isTeamDoneDrafting(tournament, draft, team)).resolves.toBe(true);
  });

  it("is done once the team's points reach the tournament's pointTotal", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, {
      pointTotal: 10,
      draftCount: new DraftCount({ min: 1, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] }); // costs 10

    await expect(isTeamDoneDrafting(tournament, draft, team)).resolves.toBe(true);
  });

  it("is not done when under both the pick-count and point limits", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, {
      pointTotal: 100,
      draftCount: new DraftCount({ min: 1, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] }); // costs 10 of 100

    await expect(isTeamDoneDrafting(tournament, draft, team)).resolves.toBe(false);
  });

  it("is done when fewer than 1 point remains, even if not exactly exhausted", async () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, {
      pointTotal: 10.5,
      draftCount: new DraftCount({ min: 1, max: 6 }),
    });
    const draft = buildDraft();
    const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] }); // costs 10, 0.5 remains

    await expect(isTeamDoneDrafting(tournament, draft, team)).resolves.toBe(true);
  });
});

describe("isDraftComplete", () => {
  it("is complete once the counter reaches the total picks needed", () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, { draftCount: new DraftCount({ min: 1, max: 2 }) });
    const draft = buildDraft({ counter: 4, teams: [buildTeam(), buildTeam()], sequentialTurns: true });

    expect(isDraftComplete(tournament, draft)).toBe(true);
  });

  it("is complete when every team has reached draftCount.max, even if the counter lags", () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, { draftCount: new DraftCount({ min: 1, max: 2 }) });
    const teams = [
      buildTeam({ pickLog: [{}, {}] }),
      buildTeam({ pickLog: [{}, {}] }),
    ];
    const draft = buildDraft({ counter: 0, teams });

    expect(isDraftComplete(tournament, draft)).toBe(true);
  });

  it("is not complete while any team is still under draftCount.max and the counter hasn't caught up", () => {
    const tierList = buildTierList();
    const tournament = buildTournament(tierList, { draftCount: new DraftCount({ min: 1, max: 2 }) });
    const teams = [buildTeam({ pickLog: [{}] }), buildTeam({ pickLog: [] })];
    const draft = buildDraft({ counter: 1, teams });

    expect(isDraftComplete(tournament, draft)).toBe(false);
  });
});

describe("tier requirement feasibility (canBeDrafted / canBeDraftedWithReason)", () => {
  function buildRequirementTierList() {
    return buildTierList({
      pokemon: new Map([
        ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
        ["charizard", new TierListPokemon({ name: "Charizard", tier: "A" })],
        ["bulbasaur", new TierListPokemon({ name: "Bulbasaur", tier: "A" })],
      ]),
    });
  }

  it("rejects a pick that would leave no roster slots to meet a required tier", async () => {
    const tierList = buildRequirementTierList();
    const tournament = buildTournament(tierList, {
      draftCount: new DraftCount({ min: 1, max: 2 }),
      tierRequirements: [{ tierName: "S", required: 1 }],
    });
    const draft = buildDraft({ teams: [] });
    const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });

    await expect(
      canBeDrafted(tournament, draft, team, { pokemonId: "bulbasaur" } as any),
    ).resolves.toBe(false);
    await expect(
      canBeDraftedWithReason(tournament, draft, team, { pokemonId: "bulbasaur" } as any),
    ).resolves.toEqual({
      canDraft: false,
      reason: "Drafting this Pokemon would make it impossible to meet tier requirements",
    });
  });

  it("allows a pick that fills the only remaining required-tier slot", async () => {
    const tierList = buildRequirementTierList();
    const tournament = buildTournament(tierList, {
      draftCount: new DraftCount({ min: 1, max: 2 }),
      tierRequirements: [{ tierName: "S", required: 1 }],
    });
    const draft = buildDraft({ teams: [] });
    const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });

    await expect(
      canBeDrafted(tournament, draft, team, { pokemonId: "pikachu" } as any),
    ).resolves.toBe(true);
  });

  it("is a no-op when no tier requirements are configured", async () => {
    const tierList = buildRequirementTierList();
    const tournament = buildTournament(tierList, { tierRequirements: [] });
    const draft = buildDraft({ teams: [] });
    const team = buildTeam({ pickLog: [{ pokemon: { id: "charizard" } }] });

    await expect(
      canBeDrafted(tournament, draft, team, { pokemonId: "bulbasaur" } as any),
    ).resolves.toBe(true);
  });
});
