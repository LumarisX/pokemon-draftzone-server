import { TransactionRunner } from "@core/database/transaction-runner";
import { TeamRepository } from "@modules/team/team.repository";
import { TournamentLogWriter } from "@modules/tournament-log/tournament-log.writer";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
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
      findAllByTournament: jest.fn().mockResolvedValue([
        {
          teamName: "Cinnabar Blaze",
          picks: [[{ pokemonId: "garchomp" }]],
        },
      ]),
    } as unknown as jest.Mocked<TeamRepository>;
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
    );
  });

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
