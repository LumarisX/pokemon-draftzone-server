import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Types } from "mongoose";
import { LeagueRepository } from "./league.repository";
import { LeagueService } from "./league.service";

function buildLeague(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: "Spring League",
    leagueKey: "springleague",
    description: "A friendly league",
    owner: "auth0|owner",
    logo: "league-logo",
    ...overrides,
  } as any;
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring Cup",
    tournamentKey: "springcup",
    description: "The spring cup",
    tierListId: "tierlist-1",
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

function buildTierList(overrides: Record<string, unknown> = {}) {
  return {
    format: "Singles",
    ruleset: "Gen9 NatDex",
    ...overrides,
  } as any;
}

describe("LeagueService.getLeagueSummary", () => {
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let service: LeagueService;

  beforeEach(() => {
    leagueRepo = { findByKey: jest.fn() } as unknown as jest.Mocked<LeagueRepository>;
    hostedTournamentRepo = {
      findAllByLeague: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = { findById: jest.fn() } as unknown as jest.Mocked<TierListRepository>;
    service = new LeagueService(leagueRepo, hostedTournamentRepo, tierListRepo);
  });

  it("looks up tournaments using the league's id and owner", async () => {
    const league = buildLeague();
    leagueRepo.findByKey.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([]);

    await service.getLeagueSummary("springleague");

    expect(leagueRepo.findByKey).toHaveBeenCalledWith("springleague");
    expect(hostedTournamentRepo.findAllByLeague).toHaveBeenCalledWith(
      league._id.toString(),
      league.owner,
    );
  });

  it("returns the league's own identity fields alongside an empty tournaments list", async () => {
    const league = buildLeague();
    leagueRepo.findByKey.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([]);

    const result = await service.getLeagueSummary("springleague");

    expect(result).toEqual({
      name: "Spring League",
      leagueKey: "springleague",
      description: "A friendly league",
      logo: "league-logo",
      tournaments: [],
    });
  });

  it("merges each tournament's own fields with its tier list's format/ruleset", async () => {
    const league = buildLeague();
    const tournament = buildTournament();
    const tierList = buildTierList({ format: "VGC", ruleset: "Paldea Dex" });
    leagueRepo.findByKey.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournament]);
    tierListRepo.findById.mockResolvedValue(tierList);

    const result = await service.getLeagueSummary("springleague");

    expect(tierListRepo.findById).toHaveBeenCalledWith("tierlist-1");
    expect(result.tournaments).toEqual([
      {
        name: "Spring Cup",
        tournamentKey: "springcup",
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
      tournamentKey: "a",
      tierListId: "tierlist-a",
    });
    const tournamentB = buildTournament({
      tournamentKey: "b",
      tierListId: "tierlist-b",
    });
    leagueRepo.findByKey.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournamentA, tournamentB]);
    tierListRepo.findById.mockImplementation((id) =>
      Promise.resolve(buildTierList({ format: id })),
    );

    const result = await service.getLeagueSummary("springleague");

    expect(result.tournaments.map((t) => t.tournamentKey)).toEqual(["a", "b"]);
    expect(result.tournaments[0].format).toBe("tierlist-a");
    expect(result.tournaments[1].format).toBe("tierlist-b");
  });
});
