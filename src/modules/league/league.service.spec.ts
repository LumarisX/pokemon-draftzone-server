import { CoachRepository } from "@modules/coach/coach.repository";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { HostingAccessService } from "@modules/tournament/sub-modules/hosted-tournament/hosting-access.service";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { UploadsService } from "@modules/upload/upload.service";
import { Types } from "mongoose";
import { LeagueRepository } from "./league.repository";
import { LeagueService } from "./league.service";

function hostingMock(canHost = true) {
  return {
    canHost: jest.fn().mockResolvedValue(canHost),
    access: jest.fn().mockResolvedValue({
      canHost,
      tournament: canHost
        ? { allowed: true }
        : { allowed: false, reason: "restricted" },
    }),
    assertCanCreateLeague: jest.fn(async () => {
      if (!canHost) throw Object.assign(new Error(), { code: "LR-002" });
    }),
  } as unknown as jest.Mocked<HostingAccessService>;
}

function buildLeague(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: "Spring League",
    slug: "springleague",
    description: "A friendly league",
    owner: "auth0|owner",
    logo: "league-logo",
    ...overrides,
  } as any;
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring Cup",
    slug: "springcup",
    description: "The spring cup",
    tierListId: "tierlist-1",
    format: { name: "Singles" },
    ruleset: { name: "Gen9 NatDex" },
    signUpDeadline: new Date("2026-01-01"),
    draftStart: new Date("2026-01-15"),
    draftEnd: new Date("2026-01-20"),
    seasonStart: new Date("2026-02-01"),
    seasonEnd: new Date("2026-04-01"),
    logo: "tournament-logo",
    discord: "discord-invite",
    ...overrides,
  } as any;
}

function buildTierList(
  overrides: { format?: string; ruleset?: string } & Record<string, unknown> = {},
) {
  const { format = "Singles", ruleset = "Gen9 NatDex", ...rest } = overrides;
  return {
    format: { name: format },
    ruleset: { name: ruleset },
    ...rest,
  } as any;
}

describe("LeagueService.getLeagueSummary", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let service: LeagueService;

  beforeEach(() => {
    leagueRepo = { findBySlug: jest.fn() } as unknown as jest.Mocked<LeagueRepository>;
    hostedTournamentRepo = {
      findAllByLeague: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = { findById: jest.fn() } as unknown as jest.Mocked<TierListRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    draftRepo = {
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<DraftRepository>;
    matchupRepo = {
      findScoringByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    service = new LeagueService(
      leagueRepo,
      hostedTournamentRepo,
      tierListRepo,
      coachRepo,
      teamRepo,
      draftRepo,
      matchupRepo,
      hostingMock(),
      {} as UploadsService,
    );
  });

  it("looks up tournaments using the resolved league", async () => {
    const league = buildLeague();
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([]);

    await service.getLeagueSummary("springleague");

    expect(leagueRepo.findBySlug).toHaveBeenCalledWith("springleague");
    expect(hostedTournamentRepo.findAllByLeague).toHaveBeenCalledWith(league);
  });

  it("returns the league's own identity fields alongside an empty tournaments list", async () => {
    const league = buildLeague();
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([]);

    const result = await service.getLeagueSummary("springleague");

    expect(result).toEqual({
      name: "Spring League",
      leagueSlug: "springleague",
      description: "A friendly league",
      logo: "league-logo",
      tournaments: [],
      isOwner: false,
      newTournamentDefaults: null,
      hosting: null,
    });
  });

  it("keeps a tournament that has no tier list yet", async () => {
    leagueRepo.findBySlug.mockResolvedValue(buildLeague());
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([
      buildTournament({ format: undefined, ruleset: undefined }),
    ]);

    const result = await service.getLeagueSummary("springleague");

    expect(result.tournaments).toHaveLength(1);
    expect(result.tournaments[0].format).toBeNull();
    expect(result.tournaments[0].ruleset).toBeNull();
  });

  it("gives the owner defaults from the latest tournament", async () => {
    leagueRepo.findBySlug.mockResolvedValue(buildLeague());
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([
      buildTournament({ slug: "old", name: "Old Cup" }),
      buildTournament({
        slug: "new",
        name: "New Cup",
        ownerName: { sub: "auth0|owner", name: "Host" },
      }),
    ]);

    const result = await service.getLeagueSummary(
      "springleague",
      "auth0|owner",
    );

    expect(result.isOwner).toBe(true);
    expect(result.newTournamentDefaults).toEqual({
      ownerName: "Host",
      copyFrom: { tournamentSlug: "new", name: "New Cup" },
    });
  });

  it("ignores a stored owner name that belongs to a previous owner", async () => {
    leagueRepo.findBySlug.mockResolvedValue(buildLeague());
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([
      buildTournament({ ownerName: { sub: "auth0|former", name: "Former" } }),
    ]);

    const result = await service.getLeagueSummary(
      "springleague",
      "auth0|owner",
    );

    expect(result.newTournamentDefaults?.ownerName).toBeNull();
  });

  it("gives other viewers no creation defaults", async () => {
    leagueRepo.findBySlug.mockResolvedValue(buildLeague());
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([buildTournament()]);

    const result = await service.getLeagueSummary(
      "springleague",
      "auth0|someone",
    );

    expect(result.isOwner).toBe(false);
    expect(result.newTournamentDefaults).toBeNull();
    expect(result.hosting).toBeNull();
  });

  it("tells the owner whether they can add a tournament", async () => {
    leagueRepo.findBySlug.mockResolvedValue(buildLeague());
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([]);

    const result = await service.getLeagueSummary(
      "springleague",
      "auth0|owner",
    );

    expect(result.hosting).toEqual({
      canHost: true,
      canCreateTournament: true,
      reason: null,
    });
  });

  it("reads format/ruleset off the tournament without fetching its tier list", async () => {
    const league = buildLeague();
    const tournament = buildTournament({
      format: { name: "VGC" },
      ruleset: { name: "Paldea Dex" },
    });
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournament]);

    const result = await service.getLeagueSummary("springleague");

    expect(tierListRepo.findById).not.toHaveBeenCalled();
    expect(result.tournaments).toEqual([
      {
        name: "Spring Cup",
        tournamentSlug: "springcup",
        description: "The spring cup",
        format: "VGC",
        ruleset: "Paldea Dex",
        signUpDeadline: tournament.signUpDeadline,
        draftStart: tournament.draftStart,
        draftEnd: tournament.draftEnd,
        seasonStart: tournament.seasonStart,
        seasonEnd: tournament.seasonEnd,
        logo: "tournament-logo",
        discord: "discord-invite",
      },
    ]);
  });

  it("processes multiple tournaments and preserves their order", async () => {
    const league = buildLeague();
    const tournamentA = buildTournament({
      slug: "a",
      format: { name: "format-a" },
    });
    const tournamentB = buildTournament({
      slug: "b",
      format: { name: "format-b" },
    });
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournamentA, tournamentB]);

    const result = await service.getLeagueSummary("springleague");

    expect(result.tournaments.map((t) => t.tournamentSlug)).toEqual(["a", "b"]);
    expect(result.tournaments[0].format).toBe("format-a");
    expect(result.tournaments[1].format).toBe("format-b");
  });
});

function buildSideResult(left: number) {
  return { score: left, pokemon: new Map() };
}

function buildScoringMatchup(options: {
  round: Types.ObjectId;
  side1Team: Types.ObjectId;
  side2Team: Types.ObjectId;
  side1Score: number;
  side2Score: number;
  side1Left: number;
  side2Left: number;
  winner: "side1" | "side2" | "draw";
}) {
  return {
    round: options.round,
    winner: options.winner,
    forfeit: false,
    side1: { team: options.side1Team, score: options.side1Score },
    side2: { team: options.side2Team, score: options.side2Score },
    results: [
      {
        winner: options.winner,
        side1: buildSideResult(options.side1Left),
        side2: buildSideResult(options.side2Left),
      },
    ],
  } as any;
}

function buildParticipantTournament(
  overrides: Record<string, unknown> = {},
): any {
  const tournamentId = new Types.ObjectId();
  return {
    id: tournamentId.toString(),
    name: "Spring Cup",
    slug: "springcup",
    leagueId: "league-1",
    tierListId: "tierlist-1",
    stages: [{ _id: new Types.ObjectId() }],
    rounds: [{ _id: new Types.ObjectId(), name: "Round 1" }],
    currentRoundIndex: 0,
    trades: [],
    forfeit: { gameDiff: 3, pokemonDiff: 6 },
    diffMode: "pokemon",
    format: { name: "Singles" },
    ruleset: { name: "Gen9 NatDex" },
    logo: undefined,
    discord: undefined,
    ...overrides,
  };
}

function buildParticipantTeam(
  tournamentId: string,
  overrides: Record<string, unknown> = {},
): any {
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(tournamentId),
    teamName: "The Team",
    coach: { name: "Coach" },
    primaryCoach: { name: "Coach" },
    pickLog: [],
    draftId: undefined,
    ...overrides,
  };
}

describe("LeagueService.getLeagues", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let service: LeagueService;

  beforeEach(() => {
    leagueRepo = {
      findById: jest.fn().mockResolvedValue(buildLeague()),
    } as unknown as jest.Mocked<LeagueRepository>;
    hostedTournamentRepo = {
      findByParticipant: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(
          buildTierList({ getPokemonFormes: () => undefined }),
        ),
      findManyByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(
            new Map(
              ids.map((id) => [
                id,
                buildTierList({ getPokemonFormes: () => undefined }),
              ]),
            ),
          ),
        ),
    } as unknown as jest.Mocked<TierListRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;
    draftRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DraftRepository>;
    matchupRepo = {
      findScoringByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    service = new LeagueService(
      leagueRepo,
      hostedTournamentRepo,
      tierListRepo,
      coachRepo,
      teamRepo,
      draftRepo,
      matchupRepo,
      hostingMock(),
      {} as UploadsService,
    );
  });

  it("scores a team from the matchups it appears in", async () => {
    const tournament = buildParticipantTournament();
    const team = buildParticipantTeam(tournament.id);
    const opponent = new Types.ObjectId();
    hostedTournamentRepo.findByParticipant.mockResolvedValue([tournament]);
    teamRepo.findManyByIds.mockResolvedValue([team]);
    matchupRepo.findScoringByStages.mockResolvedValue([
      buildScoringMatchup({
        round: tournament.rounds[0]._id,
        side1Team: team._id,
        side2Team: opponent,
        side1Score: 2,
        side2Score: 0,
        side1Left: 4,
        side2Left: 0,
        winner: "side1",
      }),
      buildScoringMatchup({
        round: tournament.rounds[0]._id,
        side1Team: opponent,
        side2Team: team._id,
        side1Score: 3,
        side2Score: 1,
        side1Left: 2,
        side2Left: 0,
        winner: "side1",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    expect(result.tournaments[0].score).toEqual({
      wins: 1,
      draws: 0,
      losses: 1,
      diff: 2,
    });
  });

  it("reports the game diff instead when the tournament scores by game", async () => {
    const tournament = buildParticipantTournament({ diffMode: "game" });
    const team = buildParticipantTeam(tournament.id);
    hostedTournamentRepo.findByParticipant.mockResolvedValue([tournament]);
    teamRepo.findManyByIds.mockResolvedValue([team]);
    matchupRepo.findScoringByStages.mockResolvedValue([
      buildScoringMatchup({
        round: tournament.rounds[0]._id,
        side1Team: team._id,
        side2Team: new Types.ObjectId(),
        side1Score: 2,
        side2Score: 0,
        side1Left: 4,
        side2Left: 0,
        winner: "side1",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    expect(result.tournaments[0].score).toEqual({
      wins: 1,
      draws: 0,
      losses: 0,
      diff: 2,
    });
  });

  it("leaves the score off a tournament whose schedule does not exist yet", async () => {
    const tournament = buildParticipantTournament();
    const team = buildParticipantTeam(tournament.id);
    hostedTournamentRepo.findByParticipant.mockResolvedValue([tournament]);
    teamRepo.findManyByIds.mockResolvedValue([team]);
    matchupRepo.findScoringByStages.mockResolvedValue([]);

    const result = await service.getLeagues("auth0|coach");

    expect(result.tournaments[0].score).toBeUndefined();
  });

  it("keeps each team's record to its own tournament", async () => {
    const tournamentA = buildParticipantTournament({ slug: "a" });
    const tournamentB = buildParticipantTournament({ slug: "b" });
    const teamA = buildParticipantTeam(tournamentA.id);
    const teamB = buildParticipantTeam(tournamentB.id);
    hostedTournamentRepo.findByParticipant.mockResolvedValue([
      tournamentA,
      tournamentB,
    ]);
    teamRepo.findManyByIds.mockResolvedValue([teamA, teamB]);
    matchupRepo.findScoringByStages.mockResolvedValue([
      buildScoringMatchup({
        round: tournamentA.rounds[0]._id,
        side1Team: teamA._id,
        side2Team: new Types.ObjectId(),
        side1Score: 2,
        side2Score: 0,
        side1Left: 2,
        side2Left: 0,
        winner: "side1",
      }),
      buildScoringMatchup({
        round: tournamentB.rounds[0]._id,
        side1Team: teamB._id,
        side2Team: new Types.ObjectId(),
        side1Score: 0,
        side2Score: 2,
        side1Left: 0,
        side2Left: 3,
        winner: "side2",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    const bySlug = new Map(
      result.tournaments.map((t) => [t.tournamentSlug, t.score]),
    );
    expect(bySlug.get("a")).toEqual({ wins: 1, draws: 0, losses: 0, diff: 2 });
    expect(bySlug.get("b")).toEqual({ wins: 0, draws: 0, losses: 1, diff: -3 });
  });

  it("asks for every stage's matchups in one query", async () => {
    const stageA = new Types.ObjectId();
    const stageB = new Types.ObjectId();
    const tournament = buildParticipantTournament({
      stages: [{ _id: stageA }, { _id: stageB }],
    });
    const team = buildParticipantTeam(tournament.id);
    hostedTournamentRepo.findByParticipant.mockResolvedValue([tournament]);
    teamRepo.findManyByIds.mockResolvedValue([team]);

    await service.getLeagues("auth0|coach");

    expect(matchupRepo.findScoringByStages).toHaveBeenCalledTimes(1);
    expect(matchupRepo.findScoringByStages).toHaveBeenCalledWith(
      [stageA, stageB],
      [team._id],
    );
  });
});

describe("LeagueService.createLeague", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;

  function serviceWith(canHost: boolean) {
    return new LeagueService(
      leagueRepo,
      {} as HostedTournamentRepository,
      {} as TierListRepository,
      {} as CoachRepository,
      {} as TeamRepository,
      {} as DraftRepository,
      {} as LeagueMatchupRepository,
      hostingMock(canHost),
      {} as UploadsService,
    );
  }

  beforeEach(() => {
    leagueRepo = {
      create: jest.fn().mockResolvedValue(buildLeague({ slug: "fresh" })),
    } as unknown as jest.Mocked<LeagueRepository>;
  });

  it("refuses users who can't host", async () => {
    await expect(
      serviceWith(false).createLeague("auth0|user", { name: "Spring" }),
    ).rejects.toMatchObject({ code: "LR-002" });
    expect(leagueRepo.create).not.toHaveBeenCalled();
  });

  it("creates the league for a host and returns its slug", async () => {
    const result = await serviceWith(true).createLeague("auth0|user", {
      name: "Spring",
      description: "",
    });

    expect(leagueRepo.create).toHaveBeenCalledWith({
      name: "Spring",
      description: undefined,
      owner: "auth0|user",
    });
    expect(result).toEqual({ leagueSlug: "fresh" });
  });

  it("reports capabilities without creating anything", async () => {
    await expect(
      serviceWith(false).getCapabilities("auth0|user"),
    ).resolves.toEqual({ canCreateLeague: false, reason: "restricted" });
    expect(leagueRepo.create).not.toHaveBeenCalled();
  });
});

describe("LeagueService.updateLeague", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let uploads: jest.Mocked<UploadsService>;
  let service: LeagueService;
  const league = buildLeague({ logo: "league-logos/old.png" });

  beforeEach(() => {
    leagueRepo = {
      findBySlug: jest.fn().mockResolvedValue(league),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LeagueRepository>;
    uploads = {
      claimUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UploadsService>;
    service = new LeagueService(
      leagueRepo,
      {} as HostedTournamentRepository,
      {} as TierListRepository,
      {} as CoachRepository,
      {} as TeamRepository,
      {} as DraftRepository,
      {} as LeagueMatchupRepository,
      hostingMock(),
      uploads,
    );
  });

  it("only lets the owner edit the league", async () => {
    await expect(
      service.updateLeague("springleague", "auth0|other", { name: "New" }),
    ).rejects.toMatchObject({ code: "LR-004" });
    expect(leagueRepo.update).not.toHaveBeenCalled();
  });

  it("claims a new logo as a league logo before saving it", async () => {
    await service.updateLeague("springleague", "auth0|owner", {
      logo: "league-logos/new.png",
    });

    expect(uploads.claimUpload).toHaveBeenCalledWith("league-logos/new.png", {
      uploadedBy: "auth0|owner",
      folder: "league-logos",
      relatedEntityId: league._id.toString(),
    });
    expect(leagueRepo.update).toHaveBeenCalledWith(
      league._id,
      expect.objectContaining({ logo: "league-logos/new.png" }),
    );
  });

  it("doesn't re-claim the logo it already has", async () => {
    await service.updateLeague("springleague", "auth0|owner", {
      logo: "league-logos/old.png",
    });

    expect(uploads.claimUpload).not.toHaveBeenCalled();
  });

  it("clears the logo and an emptied description", async () => {
    await service.updateLeague("springleague", "auth0|owner", {
      logo: null,
      description: "",
    });

    expect(leagueRepo.update).toHaveBeenCalledWith(league._id, {
      name: undefined,
      description: null,
      logo: null,
    });
  });

  it("writes nothing for an empty update", async () => {
    await service.updateLeague("springleague", "auth0|owner", {});

    expect(leagueRepo.update).not.toHaveBeenCalled();
  });
});
