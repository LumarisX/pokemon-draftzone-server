import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueRepository } from "@modules/league/league.repository";
import { TierListAccessService } from "@modules/tier-list/tier-list-access.service";
import { TierListHistoryService } from "@modules/tier-list/tier-list-history.service";
import { Tier, TierList } from "@modules/tier-list/tier-list.domain";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Types } from "mongoose";
import { CreateTournamentDto } from "./hosted-tournament.dto";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { SignUpQuestionEntity } from "./hosted-tournament.schema";
import { HostingAccessService } from "./hosting-access.service";
import {
  carriedQuestions,
  DEFAULT_DRAFT_COUNT,
  TournamentCreationService,
} from "./tournament-creation.service";

const leagueId = new Types.ObjectId();
const tierId = new Types.ObjectId();
const sourceTierListId = new Types.ObjectId();
const copiedTierListId = new Types.ObjectId();
const createdTournamentId = new Types.ObjectId();

function question(
  id: string,
  overrides: Partial<SignUpQuestionEntity> = {},
): SignUpQuestionEntity {
  return {
    id,
    label: id,
    type: "short",
    options: [],
    required: false,
    archived: false,
    ...overrides,
  };
}

function buildSource(overrides: Record<string, unknown> = {}) {
  return {
    name: "Season 1",
    slug: "season1",
    league: leagueId,
    description: "Season one",
    rules: [{ title: "Be nice", body: "" }],
    signUpQuestions: [question("q1")],
    maxTeams: 16,
    forfeit: { gameDiff: 2, pokemonDiff: 6 },
    diffMode: "game",
    draftCount: { min: 10, max: 12 },
    pointTotal: 100,
    tierList: sourceTierListId,
    tierRequirements: [{ tierId, required: 1 }],
    staff: [{ sub: "auth0|helper", role: "organizer" }],
    discordSettings: { guildId: "guild" },
    signUpToken: "secret",
    signUpAccess: "invite",
    adSettings: { advertise: true, platforms: ["showdown"] },
    ...overrides,
  } as any;
}

function sourceTierList(
  overrides: Partial<ConstructorParameters<typeof TierList>[0]> = {},
) {
  return new TierList({
    id: sourceTierListId.toString(),
    slug: "season1list",
    name: "Season 1 list",
    createdBy: "auth0|owner",
    pokemon: new Map(),
    tiers: [new Tier({ id: tierId.toString(), name: "S", cost: 20 })],
    banned: { moves: [], abilities: [] },
    format: "Singles",
    ruleset: "Gen9 NatDex",
    tournamentId: new Types.ObjectId().toString(),
    version: 3,
    ...overrides,
  });
}

function dto(overrides: Partial<CreateTournamentDto> = {}): CreateTournamentDto {
  return {
    name: "Season 2",
    ownerName: "Host",
    signUpDeadline: new Date("2026-10-01"),
    diffMode: "pokemon",
    draftCount: { min: 8, max: 10 },
    ...overrides,
  };
}

describe("TournamentCreationService", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let hosting: jest.Mocked<HostingAccessService>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let access: jest.Mocked<TierListAccessService>;
  let history: jest.Mocked<TierListHistoryService>;
  let service: TournamentCreationService;

  beforeEach(() => {
    hosting = {
      assertCanCreateTournament: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostingAccessService>;
    leagueRepo = {
      findBySlug: jest
        .fn()
        .mockResolvedValue({ _id: leagueId, owner: "auth0|owner" }),
    } as unknown as jest.Mocked<LeagueRepository>;
    tournamentRepo = {
      findPlainInLeague: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ _id: createdTournamentId, slug: "created" }),
      updateSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    draftRepo = {
      create: jest.fn().mockResolvedValue({ slug: "pool" }),
    } as unknown as jest.Mocked<DraftRepository>;
    tierListRepo = {
      findById: jest.fn().mockResolvedValue(sourceTierList()),
      create: jest
        .fn()
        .mockResolvedValue({ id: copiedTierListId.toString(), version: 1 }),
      incrementUseCount: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TierListRepository>;
    access = {
      resolve: jest.fn().mockResolvedValue({
        tierList: sourceTierList({ tournamentId: undefined }),
        access: "view",
        tournament: null,
      }),
    } as unknown as jest.Mocked<TierListAccessService>;
    history = {
      recordCreated: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TierListHistoryService>;
    service = new TournamentCreationService(
      leagueRepo,
      tournamentRepo,
      tierListRepo,
      hosting,
      { run: (work: () => Promise<unknown>) => work() } as TransactionRunner,
      draftRepo,
      access,
      history,
    );
  });

  it("gives a new tournament one draft pool so its pool settings are reachable", async () => {
    await service.createTournament("league", "auth0|owner", dto());

    expect(draftRepo.create).toHaveBeenCalledWith({
      tournamentId: createdTournamentId,
      name: "Draft Pool",
    });
  });

  it("only lets the league owner or an admin create a tournament", async () => {
    await expect(
      service.createTournament("league", "auth0|other", dto()),
    ).rejects.toMatchObject({ code: "LR-005" });
    expect(tournamentRepo.create).not.toHaveBeenCalled();
  });

  it("lets a league admin create a tournament without the hosting role and seats them as an organizer", async () => {
    leagueRepo.findBySlug.mockResolvedValue({
      _id: leagueId,
      owner: "auth0|owner",
      admins: [{ sub: "auth0|admin", name: "Brock" }],
    } as never);
    tournamentRepo.findPlainInLeague.mockResolvedValue(
      buildSource({ ownerName: { sub: "auth0|owner", name: "Host" } }),
    );

    await service.createTournament(
      "league",
      "auth0|admin",
      dto({ ownerName: "Brock", copyFrom: "season1" }),
    );

    expect(hosting.assertCanCreateTournament).not.toHaveBeenCalled();
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerName: { sub: "auth0|owner", name: "Host" },
        staff: [{ sub: "auth0|admin", name: "Brock", role: "organizer" }],
      }),
    );
  });

  it("stops a league owner who can't host", async () => {
    hosting.assertCanCreateTournament.mockRejectedValue(
      new PDZError(ErrorCodes.TOURNAMENT.CREATION_RESTRICTED),
    );

    await expect(
      service.createTournament("league", "auth0|owner", dto()),
    ).rejects.toMatchObject({ code: "TRN-022" });
    expect(hosting.assertCanCreateTournament).toHaveBeenCalledWith(
      "auth0|owner",
    );
    expect(tournamentRepo.create).not.toHaveBeenCalled();
  });

  it("creates a blank tournament with sign-ups closed and the owner's name", async () => {
    const result = await service.createTournament(
      "league",
      "auth0|owner",
      dto(),
    );

    expect(result).toEqual({ tournamentSlug: "created" });
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Season 2",
        league: leagueId,
        ownerName: { sub: "auth0|owner", name: "Host" },
        signUpAccess: "closed",
        forfeit: { gameDiff: 0, pokemonDiff: 0 },
        diffMode: "pokemon",
        draftCount: { min: 8, max: 10 },
        tierRequirements: [],
      }),
    );
    expect(tierListRepo.create).not.toHaveBeenCalled();
    expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
  });

  it("fills in a deadline, differential and roster size when none are given", async () => {
    const before = Date.now();
    await service.createTournament(
      "league",
      "auth0|owner",
      dto({
        signUpDeadline: undefined,
        diffMode: undefined,
        draftCount: undefined,
      }),
    );

    const created = tournamentRepo.create.mock.calls[0][0] as {
      signUpDeadline: Date;
      diffMode: string;
      draftCount: { min: number; max: number };
    };
    expect(created.diffMode).toBe("pokemon");
    expect(created.draftCount).toEqual(DEFAULT_DRAFT_COUNT);
    expect(created.signUpDeadline.getTime()).toBeGreaterThan(before);
  });

  it("rejects an inverted draft count", async () => {
    await expect(
      service.createTournament(
        "league",
        "auth0|owner",
        dto({ draftCount: { min: 12, max: 10 } }),
      ),
    ).rejects.toMatchObject({ code: "TRN-003" });
  });

  it("refuses to copy from a tournament outside the league", async () => {
    await expect(
      service.createTournament(
        "league",
        "auth0|owner",
        dto({ copyFrom: "elsewhere" }),
      ),
    ).rejects.toMatchObject({ code: "TRN-021" });
    expect(tournamentRepo.findPlainInLeague).toHaveBeenCalledWith(
      leagueId,
      "elsewhere",
    );
  });

  it("copies settings and forks the tier list, but not staff, Discord or access", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ copyFrom: "season1", diffMode: undefined, draftCount: undefined }),
    );

    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: "auth0|owner",
        copiedFrom: sourceTierListId,
        copiedFromVersion: 3,
        tournament: createdTournamentId,
        state: expect.objectContaining({
          tiers: [{ id: tierId.toString(), name: "S", cost: 20 }],
        }),
      }),
    );
    expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
      createdTournamentId,
      { tierList: copiedTierListId },
    );
    expect(history.recordCreated).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "copy", actor: "auth0|owner" }),
    );
    const created = tournamentRepo.create.mock.calls[0][0];
    expect(created).toEqual(
      expect.objectContaining({
        name: "Season 2",
        description: "Season one",
        rules: [{ title: "Be nice", body: "" }],
        maxTeams: 16,
        forfeit: { gameDiff: 2, pokemonDiff: 6 },
        diffMode: "game",
        draftCount: { min: 10, max: 12 },
        pointTotal: 100,
        tierRequirements: [{ tierId, required: 1 }],
        signUpAccess: "closed",
        staff: [],
        adSettings: { advertise: false, platforms: ["showdown"] },
      }),
    );
    expect(created).not.toHaveProperty("discordSettings");
    expect(created).not.toHaveProperty("signUpToken");
  });

  it("lets the form override the copied draft count", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ copyFrom: "season1", draftCount: { min: 6, max: 8 } }),
    );

    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ draftCount: { min: 6, max: 8 } }),
    );
  });

  it("drops tier requirements when the source's tier list is gone", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());
    tierListRepo.findById.mockRejectedValue(
      new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND),
    );

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ copyFrom: "season1" }),
    );

    expect(tierListRepo.create).not.toHaveBeenCalled();
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tierRequirements: [] }),
    );
    expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
  });

  it("starts from any list the creator can see and links it as the source", async () => {
    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ tierListSlug: "public-list" }),
    );

    expect(access.resolve).toHaveBeenCalledWith(
      "public-list",
      "auth0|owner",
      "view",
    );
    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        copiedFrom: sourceTierListId,
        copiedFromVersion: 3,
        tournament: createdTournamentId,
      }),
    );
    expect(tierListRepo.incrementUseCount).toHaveBeenCalledWith(
      sourceTierListId.toString(),
    );
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tierRequirements: [] }),
    );
  });

  it("links a copy of last season's list to that list's own source", async () => {
    const upstreamId = new Types.ObjectId();
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());
    tierListRepo.findById.mockResolvedValue(
      sourceTierList({ copiedFrom: upstreamId.toString(), copiedFromVersion: 7 }),
    );

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ tierListFrom: "season1" }),
    );

    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ copiedFrom: upstreamId, copiedFromVersion: 7 }),
    );
    expect(tierListRepo.incrementUseCount).not.toHaveBeenCalled();
  });

  it("branches a tier list without copying the other settings", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ tierListFrom: "season1" }),
    );

    expect(tournamentRepo.findPlainInLeague).toHaveBeenCalledWith(
      leagueId,
      "season1",
    );
    expect(tierListRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ copiedFrom: sourceTierListId }),
    );
    expect(tournamentRepo.updateSettings).toHaveBeenCalledWith(
      createdTournamentId,
      { tierList: copiedTierListId },
    );
    const created = tournamentRepo.create.mock.calls[0][0];
    expect(created).toEqual(
      expect.objectContaining({
        diffMode: "pokemon",
        draftCount: { min: 8, max: 10 },
        tierRequirements: [],
      }),
    );
    expect(created).not.toHaveProperty("rules");
  });

  it("copies settings but skips the tier list when asked", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(buildSource());

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ copyFrom: "season1", tierListFrom: null }),
    );

    expect(tierListRepo.findById).not.toHaveBeenCalled();
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [{ title: "Be nice", body: "" }],
        tierRequirements: [],
      }),
    );
    expect(tournamentRepo.updateSettings).not.toHaveBeenCalled();
  });

  it("refuses to branch from a tournament with no tier list", async () => {
    tournamentRepo.findPlainInLeague.mockResolvedValue(
      buildSource({ tierList: undefined }),
    );

    await expect(
      service.createTournament(
        "league",
        "auth0|owner",
        dto({ tierListFrom: "season1" }),
      ),
    ).rejects.toMatchObject({ code: "TRN-021" });
    expect(tournamentRepo.create).not.toHaveBeenCalled();
  });
});

describe("carriedQuestions", () => {
  it("drops archived questions and dependencies that pointed at them", () => {
    const result = carriedQuestions([
      question("keep"),
      question("gone", { archived: true }),
      question("child", { dependsOn: { questionId: "gone", equals: "yes" } }),
      question("linked", { dependsOn: { questionId: "keep", equals: "yes" } }),
    ]);

    expect(result.map((q) => q.id)).toEqual(["keep", "child", "linked"]);
    expect(result[1].dependsOn).toBeUndefined();
    expect(result[2].dependsOn).toEqual({ questionId: "keep", equals: "yes" });
  });
});
