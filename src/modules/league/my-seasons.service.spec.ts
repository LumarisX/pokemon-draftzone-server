import { CoachRepository } from "@modules/coach/coach.repository";
import { DraftRepository } from "@modules/draft/draft.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Types } from "mongoose";
import { seasonPhase } from "./my-league-entry";
import { MySeasonsService } from "./my-seasons.service";
import { SeasonRanksService } from "./season-ranks.service";

function buildTournament(overrides: Record<string, unknown> = {}): any {
  return {
    id: new Types.ObjectId().toString(),
    name: "Spring Cup",
    slug: "springcup",
    leagueName: "PDBL",
    leagueSlug: "pdbl",
    tierListId: "tierlist-1",
    stages: [{ _id: new Types.ObjectId() }],
    rounds: [
      { _id: new Types.ObjectId(), name: "Round 1" },
      { _id: new Types.ObjectId(), name: "Round 2" },
    ],
    currentRoundIndex: 0,
    trades: [],
    forfeit: { gameDiff: 3, pokemonDiff: 6 },
    diffMode: "pokemon",
    format: { name: "Singles" },
    ruleset: { name: "Gen9 NatDex" },
    ...overrides,
  };
}

function buildTeam(tournamentId: string, overrides: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(tournamentId),
    teamName: "The Team",
    slug: "the-team",
    primaryCoach: { name: "Coach" },
    pickLog: [],
    draftId: undefined,
    ...overrides,
  };
}

function buildMatchup(options: {
  slug: string;
  stage: Types.ObjectId;
  round: Types.ObjectId;
  side1: Types.ObjectId;
  side2: Types.ObjectId;
  winner?: "side1" | "side2";
}): any {
  return {
    slug: options.slug,
    stage: options.stage,
    round: options.round,
    winner: options.winner,
    forfeit: false,
    side1: { team: options.side1, score: options.winner === "side1" ? 2 : 0 },
    side2: { team: options.side2, score: options.winner === "side2" ? 2 : 0 },
    results: options.winner
      ? [
          {
            winner: options.winner,
            side1: { score: options.winner === "side1" ? 3 : 0 },
            side2: { score: options.winner === "side2" ? 3 : 0 },
          },
        ]
      : [],
  };
}

describe("seasonPhase", () => {
  it("is completed whenever a completion date is set", () => {
    expect(seasonPhase(new Date(), ["IN_PROGRESS"])).toBe("completed");
  });

  it("is drafting while any pool is running or paused", () => {
    expect(seasonPhase(null, ["COMPLETED", "PAUSED"])).toBe("drafting");
  });

  it("is upcoming with no pools or only pools that have not started", () => {
    expect(seasonPhase(null, [])).toBe("upcoming");
    expect(seasonPhase(null, ["PRE_DRAFT", "NOT_STARTED"])).toBe("upcoming");
  });

  it("is in season once a pool has finished drafting", () => {
    expect(seasonPhase(null, ["COMPLETED"])).toBe("season");
  });
});

describe("MySeasonsService.hosted", () => {
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let draftRepo: jest.Mocked<DraftRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let service: MySeasonsService;

  function seat(teams: any[], tournaments: any[], seats: any[] = []) {
    coachRepo.findByAuth0Id.mockResolvedValue(
      (seats.length ? seats : teams.map((team) => ({ teamId: team._id }))) as never,
    );
    hostedTournamentRepo.findManyByIds.mockResolvedValue(tournaments);
    return teams;
  }

  beforeEach(() => {
    hostedTournamentRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findByStaff: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;
    draftRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findAllByTournaments: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DraftRepository>;
    matchupRepo = {
      findScoringByStages: jest.fn().mockResolvedValue([]),
      findSeasonByStages: jest.fn().mockResolvedValue([]),
      fingerprintsByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    service = new MySeasonsService(
      hostedTournamentRepo,
      {
        findRosterFormes: jest.fn().mockResolvedValue(new Map()),
      } as unknown as TierListRepository,
      coachRepo,
      teamRepo,
      draftRepo,
      matchupRepo,
      new SeasonRanksService(matchupRepo),
    );
  });

  it("asks for no teams or tournaments when the user coaches nothing", async () => {
    const result = await service.hosted("auth0|nobody");

    expect(result).toEqual({ tournaments: [], organizing: [], completedCount: 0 });
    expect(teamRepo.findManyByIds).not.toHaveBeenCalled();
    expect(hostedTournamentRepo.findManyByIds).not.toHaveBeenCalled();
  });

  it("leaves completed seasons out and counts them when asked to", async () => {
    const live = buildTournament({ slug: "live" });
    const done = buildTournament({ slug: "done", completedAt: new Date() });
    const teams = seat(
      [buildTeam(live.id), buildTeam(done.id)],
      [live, done],
    );
    teamRepo.findManyByIds.mockResolvedValue(teams);

    const result = await service.hosted("auth0|coach", {
      includeCompleted: false,
    });

    expect(result.tournaments.map((entry) => entry.tournamentSlug)).toEqual([
      "live",
    ]);
    expect(result.completedCount).toBe(1);
    expect(matchupRepo.findScoringByStages).toHaveBeenCalledWith(
      [live.stages[0]._id],
      [teams[0]._id],
    );
  });

  it("loads no season matchups for a completed season", async () => {
    const done = buildTournament({ completedAt: new Date() });
    const teams = seat([buildTeam(done.id)], [done]);
    teamRepo.findManyByIds.mockResolvedValue(teams);

    const result = await service.hosted("auth0|coach");

    expect(matchupRepo.fingerprintsByStages).not.toHaveBeenCalled();
    expect(matchupRepo.findSeasonByStages).not.toHaveBeenCalled();
    expect(result.tournaments[0]).toMatchObject({
      phase: "completed",
      next: null,
      standing: null,
    });
  });

  it("ranks the team and names its next opponent from one query over public stages", async () => {
    const publicStage = new Types.ObjectId();
    const hiddenStage = new Types.ObjectId();
    const tournament = buildTournament({
      stages: [{ _id: publicStage }, { _id: hiddenStage, public: false }],
    });
    const mine = buildTeam(tournament.id);
    const beaten = new Types.ObjectId();
    const upcoming = buildTeam(tournament.id, {
      teamName: "Rivals",
      slug: "rivals",
      primaryCoach: { name: "Blue" },
    });
    seat([mine], [tournament]);
    teamRepo.findManyByIds.mockImplementation(async (ids) =>
      [mine, upcoming].filter((team) =>
        ids.some((id) => id.toString() === team._id.toString()),
      ),
    );
    const matchups = [
      buildMatchup({
        slug: "m1",
        stage: publicStage,
        round: tournament.rounds[0]._id,
        side1: mine._id,
        side2: beaten,
        winner: "side1",
      }),
      buildMatchup({
        slug: "m2",
        stage: publicStage,
        round: tournament.rounds[1]._id,
        side1: upcoming._id,
        side2: mine._id,
      }),
      buildMatchup({
        slug: "hidden",
        stage: hiddenStage,
        round: tournament.rounds[0]._id,
        side1: mine._id,
        side2: beaten,
      }),
    ];
    matchupRepo.findScoringByStages.mockResolvedValue(matchups as never);
    matchupRepo.findSeasonByStages.mockResolvedValue(
      matchups.slice(0, 2) as never,
    );

    const result = await service.hosted("auth0|coach");

    expect(matchupRepo.findSeasonByStages).toHaveBeenCalledTimes(1);
    expect(matchupRepo.findSeasonByStages).toHaveBeenCalledWith([publicStage]);
    expect(teamRepo.findManyByIds).toHaveBeenLastCalledWith([
      upcoming._id.toString(),
    ]);
    expect(result.tournaments[0].standing).toEqual({ rank: 1, of: 3 });
    expect(result.tournaments[0].next).toMatchObject({
      round: "Round 2",
      matchupSlug: "m2",
      opponent: { name: "Rivals", coach: "Blue", teamSlug: "rivals" },
    });
  });

  it("lists both teams when one person coaches two in the same tournament", async () => {
    const tournament = buildTournament();
    const teams = seat(
      [
        buildTeam(tournament.id, { teamName: "First" }),
        buildTeam(tournament.id, { teamName: "Second" }),
      ],
      [tournament],
    );
    teamRepo.findManyByIds.mockResolvedValue(teams);

    const result = await service.hosted("auth0|coach");

    expect(result.tournaments.map((entry) => entry.teamName)).toEqual([
      "First",
      "Second",
    ]);
  });
});
