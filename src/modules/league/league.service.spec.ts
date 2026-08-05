import { CoachRepository } from "@modules/coach/coach.repository";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Types } from "mongoose";
import { LeagueRepository } from "./league.repository";
import { LeagueService } from "./league.service";

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
  // Mirror the TierList domain, which resolves format/ruleset to objects;
  // the service only sends their `name` to the client.
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
    });
  });

  it("merges each tournament's own fields with its tier list's format/ruleset", async () => {
    const league = buildLeague();
    const tournament = buildTournament();
    const tierList = buildTierList({ format: "VGC", ruleset: "Paldea Dex" });
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournament]);
    tierListRepo.findById.mockResolvedValue(tierList);

    const result = await service.getLeagueSummary("springleague");

    expect(tierListRepo.findById).toHaveBeenCalledWith("tierlist-1");
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
      tierListId: "tierlist-a",
    });
    const tournamentB = buildTournament({
      slug: "b",
      tierListId: "tierlist-b",
    });
    leagueRepo.findBySlug.mockResolvedValue(league);
    hostedTournamentRepo.findAllByLeague.mockResolvedValue([tournamentA, tournamentB]);
    tierListRepo.findById.mockImplementation((id) =>
      Promise.resolve(buildTierList({ format: id })),
    );

    const result = await service.getLeagueSummary("springleague");

    expect(result.tournaments.map((t) => t.tournamentSlug)).toEqual(["a", "b"]);
    expect(result.tournaments[0].format).toBe("tierlist-a");
    expect(result.tournaments[1].format).toBe("tierlist-b");
  });
});

/** A side's result block with `fainted` pokemon, which is what diffs count. */
function buildSideResult(fainted: number) {
  return {
    score: 0,
    pokemon: new Map(
      Array.from({ length: fainted }, (_, i) => [
        `mon${i}`,
        { status: "fainted" },
      ]),
    ),
  };
}

/**
 * A matchup shaped the way `findScoringByStages` returns them — unpopulated, so
 * each side's `team` is a raw ObjectId rather than a team document.
 */
function buildScoringMatchup(options: {
  round: Types.ObjectId;
  side1Team: Types.ObjectId;
  side2Team: Types.ObjectId;
  side1Score: number;
  side2Score: number;
  side1Fainted: number;
  side2Fainted: number;
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
        side1: buildSideResult(options.side1Fainted),
        side2: buildSideResult(options.side2Fainted),
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
        side1Fainted: 1,
        side2Fainted: 5,
        winner: "side1",
      }),
      buildScoringMatchup({
        round: tournament.rounds[0]._id,
        side1Team: opponent,
        side2Team: team._id,
        side1Score: 3,
        side2Score: 1,
        side1Fainted: 2,
        side2Fainted: 4,
        winner: "side1",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    // Pokemon diff is the opponent's faints less the team's own: +4 on the win
    // (5 against 1), -2 on the loss (2 against 4). The game diff would be 0
    // over the same two matches, so this also pins which one is reported.
    expect(result.tournaments[0].score).toEqual({
      wins: 1,
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
        side1Fainted: 1,
        side2Fainted: 5,
        winner: "side1",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    expect(result.tournaments[0].score).toEqual({
      wins: 1,
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
    // Both tournaments' matchups come back from the one query; only team A's
    // may land on team A's card.
    matchupRepo.findScoringByStages.mockResolvedValue([
      buildScoringMatchup({
        round: tournamentA.rounds[0]._id,
        side1Team: teamA._id,
        side2Team: new Types.ObjectId(),
        side1Score: 2,
        side2Score: 0,
        side1Fainted: 0,
        side2Fainted: 2,
        winner: "side1",
      }),
      buildScoringMatchup({
        round: tournamentB.rounds[0]._id,
        side1Team: teamB._id,
        side2Team: new Types.ObjectId(),
        side1Score: 0,
        side2Score: 2,
        side1Fainted: 3,
        side2Fainted: 0,
        winner: "side2",
      }),
    ] as any);

    const result = await service.getLeagues("auth0|coach");

    const bySlug = new Map(
      result.tournaments.map((t) => [t.tournamentSlug, t.score]),
    );
    expect(bySlug.get("a")).toEqual({ wins: 1, losses: 0, diff: 2 });
    expect(bySlug.get("b")).toEqual({ wins: 0, losses: 1, diff: -3 });
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
