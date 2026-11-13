import { ArchiveRepository } from "@modules/archive/archive.repository";
import { LeagueService } from "@modules/league/league.service";
import { MySeasonsService } from "@modules/league/my-seasons.service";
import { ExternalTournamentRepository } from "@modules/tournament/sub-modules/external-tournament/external-tournament.repository";
import { DashboardService } from "./dashboard.service";

function hostedSeason(overrides: Record<string, unknown> = {}) {
  return {
    phase: "season",
    teamId: "team-1",
    teamName: "The Team",
    teamSlug: "the-team",
    logo: "logo.png",
    leagueName: "PDBL",
    leagueSlug: "pdbl",
    tournamentName: "Season 4",
    tournamentSlug: "s4",
    poolSlug: "pool-a",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    draft: [{ id: "pikachu", name: "Pikachu" }],
    score: { wins: 3, draws: 0, losses: 1, diff: 5 },
    form: ["win", "loss"],
    standing: { rank: 2, of: 12 },
    next: null,
    draftState: null,
    startsAt: null,
    ...overrides,
  };
}

function externalTournament(overrides: Record<string, unknown> = {}) {
  return {
    slug: "ext-1",
    teamName: "Away Team",
    leagueName: "Off-Site League",
    format: { name: "VGC" },
    ruleset: { name: "Paldea Dex" },
    team: [],
    unresolvedTeam: [],
    getScore: () => ({ wins: 0, losses: 0, diff: "+0" }),
    getForm: () => [],
    getNextMatch: () => null,
    ...overrides,
  };
}

describe("DashboardService.getDashboard", () => {
  let seasons: jest.Mocked<MySeasonsService>;
  let leagues: jest.Mocked<LeagueService>;
  let externalRepo: jest.Mocked<ExternalTournamentRepository>;
  let archiveRepo: jest.Mocked<ArchiveRepository>;
  let service: DashboardService;

  beforeEach(() => {
    seasons = {
      hosted: jest.fn().mockResolvedValue({
        tournaments: [],
        organizing: [],
        completedCount: 0,
      }),
    } as unknown as jest.Mocked<MySeasonsService>;
    leagues = {
      getOwnedLeagues: jest.fn().mockResolvedValue({ leagues: [] }),
    } as unknown as jest.Mocked<LeagueService>;
    externalRepo = {
      findByOwner: jest.fn().mockResolvedValue([]),
      countCompletedByOwner: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<ExternalTournamentRepository>;
    archiveRepo = {
      countByOwner: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<ArchiveRepository>;
    service = new DashboardService(seasons, leagues, externalRepo, archiveRepo);
  });

  it("asks for hosted seasons without the completed ones", async () => {
    await service.getDashboard("auth0|coach");

    expect(seasons.hosted).toHaveBeenCalledWith("auth0|coach", {
      includeCompleted: false,
    });
  });

  it("returns hosted and external teams in one shape", async () => {
    seasons.hosted.mockResolvedValue({
      tournaments: [hostedSeason()],
      organizing: [],
      completedCount: 0,
    } as never);
    externalRepo.findByOwner.mockResolvedValue([
      externalTournament({
        getScore: () => ({ wins: 2, losses: 1, diff: "+3" }),
        getNextMatch: () => ({
          round: "Week 4",
          matchupId: "matchup-9",
          when: null,
          exactTime: false,
          opponent: { name: "Rivals", coach: null },
        }),
      }),
    ] as never);

    const { teams } = await service.getDashboard("auth0|coach");

    expect(teams).toEqual([
      expect.objectContaining({
        id: "hosted:team-1",
        kind: "hosted",
        record: { wins: 3, draws: 0, losses: 1 },
        standing: { rank: 2, of: 12 },
        hosted: {
          leagueSlug: "pdbl",
          tournamentSlug: "s4",
          teamSlug: "the-team",
          poolSlug: "pool-a",
        },
        external: null,
      }),
      expect.objectContaining({
        id: "external:ext-1",
        kind: "external",
        tournamentName: null,
        record: { wins: 2, draws: 0, losses: 1 },
        standing: null,
        next: expect.objectContaining({
          round: "Week 4",
          matchupId: "matchup-9",
          matchupSlug: null,
          opponent: expect.objectContaining({ name: "Rivals" }),
        }),
        hosted: null,
        external: { slug: "ext-1" },
      }),
    ]);
  });

  it("shows no record for an external team that has not played", async () => {
    externalRepo.findByOwner.mockResolvedValue([externalTournament()] as never);

    const { teams } = await service.getDashboard("auth0|coach");

    expect(teams[0].record).toBeNull();
  });

  it("adds up completed seasons from every source", async () => {
    seasons.hosted.mockResolvedValue({
      tournaments: [],
      organizing: [],
      completedCount: 2,
    } as never);
    externalRepo.countCompletedByOwner.mockResolvedValue(3);
    archiveRepo.countByOwner.mockResolvedValue(4);

    const { completedCount } = await service.getDashboard("auth0|coach");

    expect(completedCount).toBe(9);
  });

  it("lists only tournaments still running under organizing", async () => {
    seasons.hosted.mockResolvedValue({
      tournaments: [],
      organizing: [
        { tournamentSlug: "live", phase: "season" },
        { tournamentSlug: "done", phase: "completed" },
      ],
      completedCount: 0,
    } as never);

    const { organizing } = await service.getDashboard("auth0|owner");

    expect(organizing.map((entry) => entry.tournamentSlug)).toEqual(["live"]);
  });

  it("puts the team on the clock first in up next", async () => {
    seasons.hosted.mockResolvedValue({
      tournaments: [
        hostedSeason({
          teamId: "drafting",
          phase: "drafting",
          draftState: {
            status: "IN_PROGRESS",
            picksMade: 1,
            rosterSize: 10,
            onClock: true,
            round: 2,
            pick: 3,
            deadline: null,
          },
        }),
      ],
      organizing: [],
      completedCount: 0,
    } as never);

    const { upNext } = await service.getDashboard("auth0|coach");

    expect(upNext).toEqual([
      { kind: "pick", teamId: "hosted:drafting", when: null },
    ]);
  });
});
