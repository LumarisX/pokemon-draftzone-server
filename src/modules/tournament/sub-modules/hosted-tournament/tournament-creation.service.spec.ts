import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueRepository } from "@modules/league/league.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Types } from "mongoose";
import { CreateTournamentDto } from "./hosted-tournament.dto";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { SignUpQuestionEntity } from "./hosted-tournament.schema";
import {
  carriedQuestions,
  TournamentCreationService,
} from "./tournament-creation.service";

const leagueId = new Types.ObjectId();
const tierId = new Types.ObjectId();
const sourceTierListId = new Types.ObjectId();
const copiedTierListId = new Types.ObjectId();

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
  let service: TournamentCreationService;

  beforeEach(() => {
    leagueRepo = {
      findBySlug: jest
        .fn()
        .mockResolvedValue({ _id: leagueId, owner: "auth0|owner" }),
    } as unknown as jest.Mocked<LeagueRepository>;
    tournamentRepo = {
      findPlainInLeague: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ slug: "created" }),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findDocument: jest.fn().mockResolvedValue({
        _id: sourceTierListId,
        name: "Season 1 list",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        tiers: [{ _id: tierId, name: "S" }],
        pokemon: new Map(),
        banned: {},
      }),
      create: jest
        .fn()
        .mockResolvedValue({ id: copiedTierListId.toString() }),
    } as unknown as jest.Mocked<TierListRepository>;
    service = new TournamentCreationService(
      leagueRepo,
      tournamentRepo,
      tierListRepo,
      { run: (work: () => Promise<unknown>) => work() } as TransactionRunner,
    );
  });

  it("only lets the league owner create a tournament", async () => {
    await expect(
      service.createTournament("league", "auth0|other", dto()),
    ).rejects.toMatchObject({ code: "LR-004" });
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
        tierList: undefined,
        tierRequirements: [],
      }),
    );
    expect(tierListRepo.create).not.toHaveBeenCalled();
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
        tiers: [{ _id: tierId, name: "S" }],
      }),
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
        tierList: copiedTierListId,
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
    tierListRepo.findDocument.mockRejectedValue(
      new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND),
    );

    await service.createTournament(
      "league",
      "auth0|owner",
      dto({ copyFrom: "season1" }),
    );

    expect(tierListRepo.create).not.toHaveBeenCalled();
    expect(tournamentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tierList: undefined, tierRequirements: [] }),
    );
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
