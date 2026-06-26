import {
  DraftCount,
  Tier,
  TierList,
  TierListPokemon,
} from "@modules/tier-list/tier-list.domain";
import { Types } from "mongoose";
import { getDraftDetails, getTeamsWithCoachStatus, isCoach } from "./team-summary";

function buildTierList(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: "tierlist-1",
    name: "Spring Tier List",
    createdBy: "auth0|owner",
    pokemon: new Map([
      ["pikachu", new TierListPokemon({ name: "Pikachu", tier: "S" })],
      ["charizard", new TierListPokemon({ name: "Charizard", tier: "A" })],
    ]),
    tiers: [new Tier({ name: "S", cost: 10 }), new Tier({ name: "A", cost: 5 })],
    banned: { moves: [], abilities: [] },
    pointTotal: 100,
    draftCount: new DraftCount({ min: 1, max: 3 }),
    format: "Singles",
    ruleset: "Gen9 NatDex",
    settings: { isPublic: true },
    collaborators: [],
    ...overrides,
  });
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { auth0Id: "auth0|coach-1", timezone: "America/Los_Angeles" },
    pickLog: [],
    picks: [],
    skipCount: 0,
    ...overrides,
  } as any;
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring League",
    logo: "league-logo",
    tierList: buildTierList(),
    ...overrides,
  } as any;
}

describe("getTeamsWithCoachStatus", () => {
  it("flags isCoach for the team whose coach matches the requesting user", async () => {
    const teamA = buildTeam({ coach: { auth0Id: "auth0|coach-1" } });
    const teamB = buildTeam({ coach: { auth0Id: "auth0|coach-2" } });
    const draft = { teams: [teamA, teamB] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|coach-1", 3);

    expect(result.find((t) => t.id === teamA._id.toString())?.isCoach).toBe(true);
    expect(result.find((t) => t.id === teamB._id.toString())?.isCoach).toBe(false);
  });

  it("sorts the requesting coach's own team first", async () => {
    const teamA = buildTeam({ teamName: "Not Mine", coach: { auth0Id: "auth0|other" } });
    const teamB = buildTeam({ teamName: "Mine", coach: { auth0Id: "auth0|me" } });
    const draft = { teams: [teamA, teamB] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|me", 3);

    expect(result[0].name).toBe("Mine");
  });

  it("includes draftPicks (with name/tier/cost) for every team, regardless of coach status", async () => {
    const team = buildTeam({
      coach: { auth0Id: "auth0|other" },
      pickLog: [{ pokemon: { id: "pikachu" }, addons: undefined }],
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|me", 3);

    expect(result[0].draft).toEqual([
      {
        id: "pikachu",
        name: "Pikachu",
        tier: "S",
        cost: 10,
        types: ["Electric"],
        capt: { tera: undefined },
      },
    ]);
  });

  it("flags capt.tera as true (never false) only when Tera Captain is selected", async () => {
    const team = buildTeam({
      pickLog: [{ pokemon: { id: "pikachu" }, addons: ["Tera Captain"] }],
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|coach-1", 3);

    expect(result[0].draft[0].capt).toEqual({ tera: true });
  });

  it("only exposes queued picks (`picks`) to the team's own coach", async () => {
    const queuedPicks = [[{ pokemonId: "charizard", addons: undefined }]];
    const ownTeam = buildTeam({ coach: { auth0Id: "auth0|me" }, picks: queuedPicks });
    const otherTeam = buildTeam({ coach: { auth0Id: "auth0|other" }, picks: queuedPicks });
    const draft = { teams: [ownTeam, otherTeam] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|me", 3);

    const ownResult = result.find((t) => t.id === ownTeam._id.toString())!;
    const otherResult = result.find((t) => t.id === otherTeam._id.toString())!;
    // Padded to maxPicks (3 rounds - 0 already picked = 3), with the queued
    // round's content in the first slot.
    expect(ownResult.picks).toHaveLength(3);
    expect(ownResult.picks[0][0]).toMatchObject({ id: "charizard", name: "Charizard" });
    expect(ownResult.picks[1]).toEqual([]);
    expect(otherResult.picks).toEqual([]);
  });

  it("pads the coach's own queued picks with empty rounds up to the remaining round count", async () => {
    const team = buildTeam({
      coach: { auth0Id: "auth0|me" },
      pickLog: [{ pokemon: { id: "pikachu" } }], // 1 pick made, 2 rounds remain (numberOfRounds=3)
      picks: [[{ pokemonId: "charizard" }]],
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|me", 3);

    expect(result[0].picks).toHaveLength(2);
    expect(result[0].picks[1]).toEqual([]);
  });

  it("sums pointTotal only across picks that resolved to a real tier", async () => {
    const team = buildTeam({
      pickLog: [
        { pokemon: { id: "pikachu" } }, // tiered, cost 10
        { pokemon: { id: "mew" } }, // untracked by the tier list
      ],
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|coach-1", 3);

    expect(result[0].pointTotal).toBe(10);
  });

  it("adds addon cost on top of the base tier cost in a draft pick's total", async () => {
    const team = buildTeam({
      pickLog: [{ pokemon: { id: "charizard" }, addons: ["Tera Captain"] }],
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament({
      tierList: buildTierList({
        pokemon: new Map([
          [
            "charizard",
            new TierListPokemon({
              name: "Charizard",
              tier: "A",
              addons: [{ name: "Tera Captain", cost: 2 }],
            }),
          ],
        ]),
      }),
    });

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|coach-1", 3);

    // Charizard's tier (A) costs 5, plus the Tera Captain addon's cost of 2.
    expect(result[0].draft[0].cost).toBe(7);
  });

  it("carries over the coach's timezone and the team's skipCount", async () => {
    const team = buildTeam({
      coach: { auth0Id: "auth0|coach-1", timezone: "Europe/London" },
      skipCount: 3,
    });
    const draft = { teams: [team] } as any;
    const tournament = buildTournament();

    const result = await getTeamsWithCoachStatus(draft, tournament, "auth0|coach-1", 3);

    expect(result[0].timezone).toBe("Europe/London");
    expect(result[0].skipCount).toBe(3);
  });
});

describe("isCoach", () => {
  it("populates the coach and compares auth0Id", async () => {
    const team = {
      coach: { auth0Id: "auth0|coach-1" },
      populate: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
    } as any;

    await expect(isCoach(team, "auth0|coach-1")).resolves.toBe(true);
    expect(team.populate).toHaveBeenCalledWith("coach");

    await expect(isCoach(team, "auth0|other")).resolves.toBe(false);
  });
});

describe("getDraftDetails", () => {
  it("assembles the combined draft + tournament + team summary", async () => {
    const teamA = buildTeam({ teamName: "A", coach: { auth0Id: "auth0|me" } });
    const teamB = buildTeam({ teamName: "B", coach: { auth0Id: "auth0|other" } });
    const draft = {
      teams: [teamA, teamB],
      name: "Spring Draft",
      orderProgression: "snake",
      sequentialTurns: true,
      visibility: "ALL",
      allowRemovals: false,
      status: "IN_PROGRESS",
      counter: 0,
      skipTime: undefined,
      useRandomSeeding: false,
      _id: new Types.ObjectId(),
    } as any;
    const tournament = buildTournament();

    const result = await getDraftDetails(tournament, draft, "auth0|me");

    expect(result.leagueName).toBe("Spring League");
    expect(result.draftName).toBe("Spring Draft");
    expect(result.orderProgression).toBe("snake");
    expect(result.rounds).toBe(3);
    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].name).toBe("A");
    expect(result.canDraft).toEqual([teamA._id.toString()]);
    expect(result.currentPick).toEqual({ round: 0, position: 0, skipTime: undefined });
    expect(result.points).toBe(100);
    expect(result.logo).toBe("league-logo");
  });
});
