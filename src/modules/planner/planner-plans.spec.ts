import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import {
  isPlanKey,
  sanitizePlans,
  tournamentOfKey,
} from "./planner-plans.domain";
import { PlannerPlansRepository } from "./planner-plans.repository";
import { PlannerPlansService } from "./planner-plans.service";

describe("planner plan keys", () => {
  it("accepts the free planner and a tournament's planner", () => {
    expect(isPlanKey("plannerData")).toBe(true);
    expect(isPlanKey("plannerData:pdbl/season-4")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPlanKey("settings")).toBe(false);
    expect(isPlanKey("plannerData:pdbl")).toBe(false);
    expect(isPlanKey("plannerData:a/b/c")).toBe(false);
    expect(isPlanKey({ $ne: "" })).toBe(false);
  });

  it("reads the tournament out of a key", () => {
    expect(tournamentOfKey("plannerData")).toBeNull();
    expect(tournamentOfKey("plannerData:pdbl/s4")).toEqual({
      leagueSlug: "pdbl",
      tournamentSlug: "s4",
    });
  });
});

describe("sanitizePlans", () => {
  it("keeps the known fields and drops everything else", () => {
    const [plan] = sanitizePlans([
      {
        format: "Singles",
        ruleset: "Gen9 NatDex",
        draftName: "Rain",
        min: 8,
        max: 10,
        system: "points",
        totalPoints: 100,
        team: [
          { id: "pelipper", tier: "B", value: 8, locked: true, script: "x" },
          { tier: "A", value: 3 },
          "garbage",
        ],
        baseline: ["pelipper", 4],
        injected: { $where: "1" },
      },
    ]);

    expect(plan).toEqual({
      format: "Singles",
      ruleset: "Gen9 NatDex",
      draftName: "Rain",
      min: 8,
      max: 10,
      system: "points",
      totalPoints: 100,
      team: [{ id: "pelipper", tier: "B", value: 8, locked: true }],
      baseline: ["pelipper"],
    });
  });

  it("keeps at most nine plans and tolerates junk", () => {
    expect(sanitizePlans("nope")).toEqual([]);
    expect(sanitizePlans(Array.from({ length: 12 }, () => ({})))).toHaveLength(9);
  });
});

describe("PlannerPlansService", () => {
  let repo: jest.Mocked<PlannerPlansRepository>;
  let service: PlannerPlansService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue(null),
      findAllByOwner: jest.fn().mockResolvedValue([]),
      countByOwner: jest.fn().mockResolvedValue(0),
      insert: jest.fn().mockResolvedValue(1),
      replace: jest.fn().mockResolvedValue(5),
    } as unknown as jest.Mocked<PlannerPlansRepository>;
    service = new PlannerPlansService(repo, {
      findBySlug: jest.fn().mockRejectedValue(new Error("gone")),
    } as unknown as HostedTournamentRepository);
  });

  it("reports revision 0 when nothing is saved yet", async () => {
    await expect(service.get("auth0|me", "plannerData")).resolves.toEqual({
      plans: null,
      revision: 0,
    });
  });

  it("refuses a key that is not a planner key", async () => {
    await expect(service.get("auth0|me", "other")).rejects.toMatchObject({
      code: "VAL-002",
    });
  });

  it("inserts on a first save and replaces after that", async () => {
    await expect(
      service.save("auth0|me", "plannerData", 0, []),
    ).resolves.toEqual({ revision: 1 });
    await expect(
      service.save("auth0|me", "plannerData", 4, []),
    ).resolves.toEqual({ revision: 5 });
    expect(repo.replace).toHaveBeenCalledWith("auth0|me", "plannerData", 4, []);
  });

  it("refuses a save based on an older revision", async () => {
    repo.replace.mockResolvedValue(null);

    await expect(
      service.save("auth0|me", "plannerData", 2, []),
    ).rejects.toMatchObject({ code: "PLN-001" });
  });

  it("refuses a first save when another device already made one", async () => {
    repo.insert.mockResolvedValue(null);

    await expect(
      service.save("auth0|me", "plannerData", 0, []),
    ).rejects.toMatchObject({ code: "PLN-001" });
  });

  it("lists only planners that hold a Pokémon, and survives a deleted tournament", async () => {
    repo.findAllByOwner.mockResolvedValue([
      {
        key: "plannerData:pdbl/s4",
        plans: [
          { draftName: "Rain", format: "Singles", ruleset: "NatDex", team: [{ id: "pelipper" }] },
          { draftName: "Empty", format: "Singles", ruleset: "NatDex", team: [] },
        ],
      },
      { key: "plannerData", plans: [{ draftName: "", team: [] }] },
    ] as never);

    const { planners } = await service.list("auth0|me");

    expect(planners).toEqual([
      expect.objectContaining({
        key: "plannerData:pdbl/s4",
        tournament: {
          leagueSlug: "pdbl",
          tournamentSlug: "s4",
          name: null,
          leagueName: null,
        },
        plans: [{ name: "Rain", format: "Singles", ruleset: "NatDex", size: 1 }],
      }),
    ]);
  });
});
