import { TransactionRunner } from "@core/database/transaction-runner";
import { TeamRepository } from "@modules/team/team.repository";
import { TournamentLogWriter } from "@modules/tournament-log/tournament-log.writer";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { DraftRepository } from "@modules/draft/draft.repository";
import { Types } from "mongoose";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListHistoryService } from "./tier-list-history.service";
import { Tier, TierList, TierListPokemon } from "./tier-list.domain";
import { TierListRepository } from "./tier-list.repository";
import { TierListService } from "./tier-list.service";
import { tierId } from "./tier-list.test-ids";
import { TournamentTierListService } from "./tournament-tier-list.service";

const ORGANIZER = "auth0|organizer";
const CURRENT_ID = new Types.ObjectId().toString();
const SOURCE_ID = new Types.ObjectId().toString();
const COPY_ID = new Types.ObjectId().toString();
const TOURNAMENT_ID = new Types.ObjectId().toString();

function list(overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {}) {
  return new TierList({
    id: CURRENT_ID,
    slug: "current",
    name: "Current List",
    createdBy: ORGANIZER,
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    ...overrides,
  });
}

const POOL_ID = new Types.ObjectId();

function draftedTeam(
  teamName: string,
  drafted: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: new Types.ObjectId(),
    teamName,
    coaches: [],
    pickLog: drafted.map((id) => ({ pokemon: { id } })),
    picks: [],
    ...overrides,
  };
}

function tournament(overrides: Record<string, unknown> = {}) {
  return {
    id: TOURNAMENT_ID,
    slug: "spring-cup",
    leagueSlug: "league",
    name: "Spring Cup",
    owner: "auth0|league-owner",
    staff: [{ sub: ORGANIZER, role: "organizer", name: "Erika" }],
    tierListId: CURRENT_ID,
    tierRequirements: [
      { tierId: tierId("S"), required: 1 },
      { tierId: tierId("A"), required: 2, max: 3 },
    ],
    signUpAccess: "open",
    completed: false,
    staffName: (sub: string) => (sub === ORGANIZER ? "Erika" : null),
    ...overrides,
  } as unknown as HostedTournament;
}

describe("TournamentTierListService", () => {
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let tierListService: jest.Mocked<TierListService>;
  let access: jest.Mocked<TierListAccessService>;
  let history: jest.Mocked<TierListHistoryService>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let logWriter: jest.Mocked<TournamentLogWriter>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let service: TournamentTierListService;

  const current = list({
    tournamentId: TOURNAMENT_ID,
    tiers: [
      new Tier({ id: tierId("S"), name: "S", cost: 20 }),
      new Tier({ id: tierId("A"), name: "A", cost: 15 }),
    ],
    pokemon: new Map([
      ["garchomp", new TierListPokemon({ name: "Garchomp", tierId: tierId("S") })],
    ]),
  });
  const incoming = list({
    id: SOURCE_ID,
    slug: "incoming",
    name: "Incoming List",
    createdBy: "auth0|someone",
    visibility: "public",
    version: 6,
    tiers: [
      new Tier({ id: tierId("X"), name: "s", cost: 22 }),
      new Tier({ id: tierId("Y"), name: "B", cost: 10 }),
    ],
    pokemon: new Map([
      ["garchomp", new TierListPokemon({ name: "Garchomp", tierId: tierId("X") })],
    ]),
  });

  beforeEach(() => {
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament()),
      updateSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest.fn().mockImplementation(async (id: string) =>
        id === CURRENT_ID ? current : incoming,
      ),
      create: jest.fn().mockResolvedValue(
        list({ id: COPY_ID, slug: "copy", name: "Incoming List", tournamentId: TOURNAMENT_ID }),
      ),
      retire: jest.fn().mockResolvedValue(undefined),
      incrementUseCount: jest.fn().mockResolvedValue(undefined),
      setCopiedFromVersion: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TierListRepository>;
    tierListService = {
      legalityReport: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({ version: 4, summary: "Moved 1 Pokémon", changes: [] }),
    } as unknown as jest.Mocked<TierListService>;
    access = {
      resolve: jest.fn().mockResolvedValue({ tierList: incoming, access: "view", tournament: null }),
      accessTo: jest.fn().mockImplementation(async (tierList: TierList) => ({
        tierList,
        access: "edit",
        tournament: tournament(),
      })),
    } as unknown as jest.Mocked<TierListAccessService>;
    history = {
      recordCreated: jest.fn().mockResolvedValue(undefined),
      stateAt: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TierListHistoryService>;
    teamRepo = {
      findAllByTournament: jest
        .fn()
        .mockResolvedValue([draftedTeam("Cinnabar Blaze", ["garchomp"])]),
    } as unknown as jest.Mocked<TeamRepository>;
    draftRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DraftRepository>;
    logWriter = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TournamentLogWriter>;
    service = new TournamentTierListService(
      tournamentRepo,
      tierListRepo,
      tierListService,
      access,
      history,
      teamRepo,
      logWriter,
      { run: (work: () => Promise<unknown>) => work() } as TransactionRunner,
      {
        find: () => ({
          select: () => ({
            lean: () => ({
              exec: () => draftRepo.findAllByTournament("tournament"),
            }),
          }),
        }),
      } as never,
    );
  });

  function blindPool(overrides: Record<string, unknown> = {}) {
    return {
      _id: POOL_ID,
      picksVisibleTo: "ownTeam",
      status: "IN_PROGRESS",
      ...overrides,
    } as any;
  }

  const recordedPicks = () =>
    (logWriter.record.mock.calls[0][2].details as any).affectedPicks;

  it("only lets organizers swap the list", async () => {
    await expect(
      service.attach("league", "spring-cup", "auth0|coach", { tierListSlug: "incoming" }),
    ).rejects.toMatchObject({ code: "AUTH-002" });
  });

  it("previews requirements kept by tier name and picks whose cost changes", async () => {
    const preview = await service.preview("league", "spring-cup", ORGANIZER, "incoming");

    expect(preview.requirements).toEqual([
      { tierName: "S", required: 1, kept: true },
      { tierName: "A", required: 2, max: 3, kept: false },
    ]);
    expect(preview.draftStarted).toBe(true);
    expect(preview.affectedPicks).toEqual([
      { team: "Cinnabar Blaze", pokemonId: "garchomp", name: "Garchomp", from: 20, to: 22 },
    ]);
  });

  it("never reports a queued Pokémon that is not drafted", async () => {
    teamRepo.findAllByTournament.mockResolvedValue([
      draftedTeam("Cinnabar Blaze", [], {
        picks: [[{ pokemonId: "garchomp" }]],
      }),
    ] as any);

    const preview = await service.preview("league", "spring-cup", ORGANIZER, "incoming");
    expect(preview.draftStarted).toBe(false);
    expect(preview.affectedPicks).toEqual([]);

    await service.attach("league", "spring-cup", ORGANIZER, { tierListSlug: "incoming" });
    expect(recordedPicks()).toEqual([]);
  });

  it("reports a drafted Pokémon whose cost changes with from and to", async () => {
    const preview = await service.preview("league", "spring-cup", ORGANIZER, "incoming");

    expect(preview.draftStarted).toBe(true);
    expect(preview.affectedPicks).toEqual([
      { team: "Cinnabar Blaze", pokemonId: "garchomp", name: "Garchomp", from: 20, to: 22 },
    ]);
  });

  it("marks the draft started when a pool is past pre-draft", async () => {
    teamRepo.findAllByTournament.mockResolvedValue([]);
    draftRepo.findAllByTournament.mockResolvedValue([blindPool()]);

    const preview = await service.preview("league", "spring-cup", ORGANIZER, "incoming");
    expect(preview.draftStarted).toBe(true);

    draftRepo.findAllByTournament.mockResolvedValue([blindPool({ status: "NOT_STARTED" })]);
    const before = await service.preview("league", "spring-cup", ORGANIZER, "incoming");
    expect(before.draftStarted).toBe(false);
  });

  it("leaves the team name off the log for a blind pool but keeps it in the organizer preview", async () => {
    teamRepo.findAllByTournament.mockResolvedValue([
      draftedTeam("Cinnabar Blaze", ["garchomp"], { draftId: POOL_ID }),
    ] as any);
    draftRepo.findAllByTournament.mockResolvedValue([blindPool()]);

    const preview = await service.preview("league", "spring-cup", ORGANIZER, "incoming");
    expect(preview.affectedPicks[0]).toMatchObject({ team: "Cinnabar Blaze" });

    await service.attach("league", "spring-cup", ORGANIZER, { tierListSlug: "incoming" });
    expect(recordedPicks()).toEqual([
      { pokemonId: "garchomp", name: "Garchomp", from: 20, to: 22 },
    ]);
    expect(JSON.stringify(logWriter.record.mock.calls)).not.toContain("Cinnabar Blaze");
  });

  it("keeps the team name in the log once the pool's picks are public", async () => {
    teamRepo.findAllByTournament.mockResolvedValue([
      draftedTeam("Cinnabar Blaze", ["garchomp"], { draftId: POOL_ID }),
    ] as any);
    draftRepo.findAllByTournament.mockResolvedValue([
      blindPool({ picksVisibleTo: "everyone" }),
    ]);

    await service.attach("league", "spring-cup", ORGANIZER, { tierListSlug: "incoming" });
    expect(recordedPicks()).toEqual([
      expect.objectContaining({ team: "Cinnabar Blaze", pokemonId: "garchomp" }),
    ]);
  });

  it("hides the team from the log when the pool cannot be resolved", async () => {
    teamRepo.findAllByTournament.mockResolvedValue([
      draftedTeam("Cinnabar Blaze", ["garchomp"], { draftId: POOL_ID }),
    ] as any);
    draftRepo.findAllByTournament.mockRejectedValue(new Error("down"));

    await service.attach("league", "spring-cup", ORGANIZER, { tierListSlug: "incoming" });
    expect(recordedPicks()[0]).not.toHaveProperty("team");
  });

  it("swaps in a fresh copy, remaps requirements, retires the old copy and logs it", async () => {
    const result = await service.attach("league", "spring-cup", ORGANIZER, {
      tierListSlug: "incoming",
      reason: "League vote",
    });

    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tournament: expect.any(Types.ObjectId),
        copiedFrom: new Types.ObjectId(SOURCE_ID),
        copiedFromVersion: 6,
      }),
    );
    expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(TOURNAMENT_ID, {
      tierList: new Types.ObjectId(COPY_ID),
      tierRequirements: [{ tierId: tierId("X"), required: 1 }],
    });
    expect(tierListRepo.retire).toHaveBeenCalledWith(CURRENT_ID);
    expect(tierListRepo.incrementUseCount).toHaveBeenCalledWith(SOURCE_ID);
    expect(logWriter.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: TOURNAMENT_ID }),
      ORGANIZER,
      expect.objectContaining({
        type: "tier-list.swapped",
        reason: "League vote",
        details: expect.objectContaining({
          requirementsKept: ["S"],
          requirementsCleared: ["A"],
          affectedPicks: [expect.objectContaining({ pokemonId: "garchomp", from: 20, to: 22 })],
        }),
      }),
    );
    expect(result.message).toBe("Tier list replaced.");
  });

  it("logs the first list as attached", async () => {
    tournamentRepo.findBySlug.mockResolvedValue(tournament({ tierListId: "", tierRequirements: [] }));

    await service.attach("league", "spring-cup", ORGANIZER, { tierListSlug: "incoming" });

    expect(tierListRepo.retire).not.toHaveBeenCalled();
    expect(logWriter.record).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZER,
      expect.objectContaining({ type: "tier-list.attached" }),
    );
  });

  it("starts a blank list for the tournament", async () => {
    tournamentRepo.findBySlug.mockResolvedValue(tournament({ tierListId: "", tierRequirements: [] }));

    await service.attach("league", "spring-cup", ORGANIZER, {
      blank: { name: "Spring List", format: "Singles", ruleset: "Gen9 NatDex" },
    });

    expect(access.resolve).not.toHaveBeenCalled();
    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Spring List", ruleset: "Gen9 NatDex" }),
    );
    expect(tierListRepo.create.mock.calls[0][0]).not.toHaveProperty("copiedFrom");
  });

  it("pulls source changes as one logged save and records the source version", async () => {
    const copyWithSource = list({
      ...current,
      id: CURRENT_ID,
      tournamentId: TOURNAMENT_ID,
      copiedFrom: SOURCE_ID,
      copiedFromVersion: 5,
      version: 3,
      format: "Singles",
      ruleset: "Gen9 NatDex",
    });
    tierListRepo.findById.mockImplementation(async (id: string) =>
      id === CURRENT_ID ? copyWithSource : incoming,
    );

    await service.pull("league", "spring-cup", ORGANIZER, { version: 3 });

    expect(history.stateAt).toHaveBeenCalledWith(incoming, 5);
    expect(tierListService.save).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZER,
      expect.objectContaining({
        expectedVersion: 3,
        kind: "pull",
        logType: "tier-list.pulled",
      }),
    );
    expect(tierListRepo.setCopiedFromVersion).toHaveBeenCalledWith(CURRENT_ID, 6);
  });
});
