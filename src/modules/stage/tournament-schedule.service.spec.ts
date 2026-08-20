import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Test } from "@nestjs/testing";
import { Types } from "mongoose";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageRepository } from "./stage.repository";
import { TournamentScheduleService } from "./tournament-schedule.service";

const round = (name: string) => ({ _id: new Types.ObjectId(), name });

const team = (teamName: string) =>
  ({
    _id: new Types.ObjectId(),
    teamName,
    logo: undefined,
    coach: { name: `${teamName} coach` },
    pickLog: [],
  }) as any;

function buildStage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: "Group A",
    type: "round-robin",
    order: 0,
    public: true,
    teamIds: [],
    pools: [],
    rounds: [],
    trades: [],
    seedingLog: [],
    currentRoundIndex: -1,
    ...overrides,
  } as any;
}

function buildMatchup(
  stageId: Types.ObjectId,
  roundId: Types.ObjectId,
  side1: any,
  side2: any,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: new Types.ObjectId(),
    stage: stageId,
    round: roundId,
    side1: { team: side1, score: 3 },
    side2: { team: side2, score: 1 },
    results: [],
    ...overrides,
  } as any;
}

describe("TournamentScheduleService", () => {
  let stageRepo: jest.Mocked<StageRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let advancement: { findBlocked: jest.Mock };
  let service: TournamentScheduleService;

  const week1 = round("Week 1");
  const week2 = round("Week 2");

  function buildTournament(overrides: Record<string, unknown> = {}) {
    return {
      id: new Types.ObjectId().toString(),
      owner: "auth0|owner",
      organizers: [],
      rounds: [week1, week2],
      currentRoundIndex: 0,
      trades: [],
      forfeit: { gameDiff: 3 },
      ...overrides,
    } as any;
  }

  beforeEach(async () => {
    stageRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<StageRepository>;
    matchupRepo = {
      findByRoundsAcrossStages: jest.fn().mockResolvedValue([]),
      findLabelFieldsByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(buildTournament()),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    teamRepo = {
      findIdsBySlugs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;

    advancement = {
      applyToTournament: jest.fn().mockResolvedValue(0),
      applyToStages: jest.fn().mockResolvedValue(0),
      findBlocked: jest.fn().mockResolvedValue(new Set<string>()),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentScheduleService,
        { provide: StageRepository, useValue: stageRepo },
        { provide: LeagueMatchupRepository, useValue: matchupRepo },
        { provide: HostedTournamentRepository, useValue: tournamentRepo },
        { provide: TeamRepository, useValue: teamRepo },
        { provide: BracketAdvancementService, useValue: advancement },
      ],
    }).compile();

    service = moduleRef.get(TournamentScheduleService);
  });

  const get = (options = {}) =>
    service.getSchedule("league-1", "tournament-1", options);

  it("returns every round, even ones with no matches, for an organizer view", async () => {
    const result = await get();

    expect(result.rounds.map((r) => r.name)).toEqual(["Week 1", "Week 2"]);
    expect(result.currentRoundIndex).toBe(0);
  });

  it("groups a round's matches by the stage they belong to", async () => {
    const groups = buildStage({ name: "Groups", order: 0 });
    const playoffs = buildStage({
      name: "Playoffs",
      order: 1,
      type: "single-elimination",
    });
    stageRepo.findAllByTournament.mockResolvedValue([groups, playoffs]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(groups._id, week1._id, team("A"), team("B")),
      buildMatchup(playoffs._id, week1._id, team("C"), team("D")),
    ]);

    const result = await get();

    expect(result.rounds[0].stages.map((s) => s.name)).toEqual([
      "Groups",
      "Playoffs",
    ]);
    expect(result.rounds[0].stages[0].matchups).toHaveLength(1);
  });

  it("orders stages within a round by the tournament's phase order", async () => {
    const late = buildStage({ name: "Playoffs", order: 5 });
    const early = buildStage({ name: "Groups", order: 1 });
    // Returned late-first, so the ordering has to come from `order`.
    stageRepo.findAllByTournament.mockResolvedValue([late, early]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(late._id, week1._id, team("A"), team("B")),
      buildMatchup(early._id, week1._id, team("C"), team("D")),
    ]);

    const result = await get();

    expect(result.rounds[0].stages.map((s) => s.name)).toEqual([
      "Groups",
      "Playoffs",
    ]);
  });

  it("drops rounds a filtered team does not play in", async () => {
    const groups = buildStage();
    stageRepo.findAllByTournament.mockResolvedValue([groups]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(groups._id, week2._id, team("A"), team("B")),
    ]);

    const result = await get({ teamSlug: "team-a-slug" });

    expect(result.rounds.map((r) => r.name)).toEqual(["Week 2"]);
  });

  it("narrows to the current round when asked", async () => {
    stageRepo.findAllByTournament.mockResolvedValue([buildStage()]);

    const result = await get({ roundFilter: "current" });

    expect(result.rounds.map((r) => r.name)).toEqual(["Week 1"]);
  });

  it("hides a hidden stage from anyone but an organizer", async () => {
    const hidden = buildStage({ name: "Hidden", public: false });
    stageRepo.findAllByTournament.mockResolvedValue([hidden]);

    await get({ sub: "auth0|stranger" });

    // The hidden stage is excluded from the query, not filtered afterwards —
    // otherwise its matchups would still be fetched and could leak.
    expect(matchupRepo.findByRoundsAcrossStages).toHaveBeenCalledWith(
      [],
      expect.anything(),
      undefined,
    );

    await get({ sub: "auth0|owner" });
    expect(matchupRepo.findByRoundsAcrossStages).toHaveBeenLastCalledWith(
      [hidden._id],
      expect.anything(),
      undefined,
    );
  });

  it("shows a forfeit as the configured game difference, not the stored score", async () => {
    const groups = buildStage();
    stageRepo.findAllByTournament.mockResolvedValue([groups]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(groups._id, week1._id, team("A"), team("B"), {
        forfeit: true,
        winner: "side1",
      }),
    ]);

    const result = await get();
    const matchup = result.rounds[0].stages[0].matchups[0];

    expect(matchup.team1.score).toBe(3);
    expect(matchup.team2.score).toBe(0);
    expect(matchup.winner).toBe("side1ffw");
  });

  describe("a tournament the migration has not reached", () => {
    // Its rounds still live on its stages, so the axis is built from those.
    const stageWeek1 = round("Stage Week 1");
    const stageWeek2 = round("Stage Week 2");

    it("builds the axis from the stages' own rounds", async () => {
      const groups = buildStage({
        rounds: [stageWeek1, stageWeek2],
        currentRoundIndex: 1,
      });
      stageRepo.findAllByTournament.mockResolvedValue([groups]);
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [], currentRoundIndex: -1 }),
      );

      const result = await get();

      expect(result.rounds.map((r) => r.name)).toEqual([
        "Stage Week 1",
        "Stage Week 2",
      ]);
      expect(result.currentRoundIndex).toBe(1);
    });

    it("walks a stage's trades against that stage's round index", async () => {
      // The trade is active from the stage's round 0. Read against the
      // concatenated axis, the second stage's rounds sit at index 2 and 3, so
      // using the global index would apply this stage's trades in the wrong
      // week entirely.
      const first = buildStage({
        name: "First",
        order: 0,
        rounds: [round("A")],
      });
      const teamA = team("A");
      const second = buildStage({
        name: "Second",
        order: 1,
        rounds: [stageWeek1, stageWeek2],
        currentRoundIndex: 0,
        trades: [
          {
            _id: new Types.ObjectId(),
            // teamA sends the Pokemon it holds and receives the other.
            side1: { team: teamA._id, pokemon: [{ id: "pikachu" }] },
            side2: { team: team("Z")._id, pokemon: [{ id: "mewtwo" }] },
            timestamp: new Date(),
            activeRound: 1,
            status: "APPROVED",
          },
        ],
      });
      teamA.pickLog = [{ pokemon: { id: "pikachu" }, addons: undefined }];

      stageRepo.findAllByTournament.mockResolvedValue([first, second]);
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [] }),
      );
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
        buildMatchup(second._id, stageWeek2._id, teamA, team("B")),
      ]);

      const result = await get();
      const week2 = result.rounds.find((r) => r.name === "Stage Week 2")!;

      // Stage round 1 — the trade has applied, so the roster shows what the
      // team received.
      expect(week2.stages[0].matchups[0].team1.draft).toEqual([
        { id: "mewtwo", capt: {} },
      ]);
    });
  });

  it("omits a bracket matchup whose slots are still unresolved", async () => {
    const playoffs = buildStage({ type: "single-elimination" });
    stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(playoffs._id, week1._id, undefined, team("B")),
    ]);

    const result = await get();

    // No teams to show yet, so the round has nothing from that stage.
    expect(result.rounds[0].stages).toEqual([]);
  });

  it("keeps a filtered team's matchup and names the slot its opponent comes from", async () => {
    const playoffs = buildStage({ type: "single-elimination" });
    const sourceId = new Types.ObjectId();
    stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(playoffs._id, week2._id, undefined, team("B"), {
        side1: { slot: { type: "winner", matchId: sourceId.toString() } },
      }),
    ]);
    // Two unlabelled semi-finals in week 1; the slot points at the second.
    matchupRepo.findLabelFieldsByStages.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        slug: "semi-one",
        stage: playoffs._id,
        round: week1._id,
        position: 0,
      },
      {
        _id: sourceId,
        slug: "semi-two",
        stage: playoffs._id,
        round: week1._id,
        position: 1,
      },
    ] as any);

    const result = await get({ teamSlug: "team-b-slug" });

    const matchups = result.rounds[0].stages[0].matchups;
    expect(matchups).toHaveLength(1);
    expect(matchups[0].team1).toMatchObject({
      name: "Winner of Match 2",
      id: null,
      slug: null,
      from: { slug: "semi-two", label: "Match 2" },
    });
    expect(matchups[0].team2.name).toBe("B");
  });

  it("falls back to TBD when the slot's source match cannot be found", async () => {
    const playoffs = buildStage({ type: "single-elimination" });
    stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(playoffs._id, week1._id, undefined, team("B"), {
        side1: { slot: { type: "winner", matchId: "gone" } },
      }),
    ]);

    const result = await get({ teamSlug: "team-b-slug" });

    expect(result.rounds[0].stages[0].matchups[0].team1).toMatchObject({
      name: "TBD",
      from: null,
    });
  });

  it("names an unresolved seed slot rather than calling it TBD", async () => {
    const playoffs = buildStage({ type: "single-elimination" });
    stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
    matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
      buildMatchup(playoffs._id, week1._id, team("A"), undefined, {
        side2: { slot: { type: "seed", seed: 4 } },
      }),
    ]);

    const result = await get({ teamSlug: "team-a-slug" });

    expect(result.rounds[0].stages[0].matchups[0].team2.name).toBe("Seed 4");
  });

  describe("bracket advancement", () => {
    it("reports the override and the blocked flag to an organizer", async () => {
      const playoffs = buildStage({ type: "single-elimination" });
      stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
      const semi = buildMatchup(playoffs._id, week1._id, team("A"), team("B"), {
        winner: "draw",
        forfeit: true,
      });
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([semi]);
      advancement.findBlocked.mockResolvedValue(new Set([semi._id.toString()]));

      const result = await get({ sub: "auth0|owner" });

      const card = result.rounds[0].stages[0].matchups[0];
      expect(card.advancementBlocked).toBe(true);
      expect(card.advances).toBeNull();
    });

    // A stranded match has a side no result will ever fill, so the ordinary
    // "both sides resolved" filter would hide the one card that needs acting on.
    it("keeps a blocked match whose opponent slot can never be filled", async () => {
      const playoffs = buildStage({ type: "single-elimination" });
      stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
      const final = buildMatchup(
        playoffs._id,
        week1._id,
        team("C"),
        undefined,
        {
          side2: { slot: { type: "winner", matchId: "some-match" } },
        },
      );
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([final]);
      advancement.findBlocked.mockResolvedValue(
        new Set([final._id.toString()]),
      );

      const result = await get({ sub: "auth0|owner" });

      expect(result.rounds[0].stages[0].matchups).toHaveLength(1);
      expect(result.rounds[0].stages[0].matchups[0].advancementBlocked).toBe(
        true,
      );
    });

    // The walkover an organizer records on a stranded match: a real result, on
    // a card that still has one empty side. Dropping it would hide a recorded
    // result the organizer may need to correct.
    it("keeps a match that has a recorded result but an empty side", async () => {
      const playoffs = buildStage({ type: "single-elimination" });
      stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
        buildMatchup(playoffs._id, week1._id, undefined, team("D"), {
          side1: { slot: { type: "winner", matchId: "gone" } },
          winner: "side2",
          forfeit: true,
        }),
      ]);

      const result = await get({ sub: "auth0|owner" });

      expect(result.rounds[0].stages[0].matchups).toHaveLength(1);
      expect(result.rounds[0].stages[0].matchups[0].winner).toBe("side2ffw");
    });

    it("still drops a match that is merely waiting on an upstream result", async () => {
      const playoffs = buildStage({ type: "single-elimination" });
      stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
        buildMatchup(playoffs._id, week1._id, team("C"), undefined, {
          side2: { slot: { type: "winner", matchId: "some-match" } },
        }),
      ]);

      const result = await get({ sub: "auth0|owner" });

      expect(result.rounds[0].stages).toHaveLength(0);
    });

    // The flag drives an organizer-only control, and the set costs a query.
    it("does not compute blocked matches for a public read", async () => {
      const playoffs = buildStage({ type: "single-elimination" });
      stageRepo.findAllByTournament.mockResolvedValue([playoffs]);
      matchupRepo.findByRoundsAcrossStages.mockResolvedValue([
        buildMatchup(playoffs._id, week1._id, team("A"), team("B")),
      ]);

      const result = await get();

      expect(advancement.findBlocked).not.toHaveBeenCalled();
      expect(result.rounds[0].stages[0].matchups[0].advancementBlocked).toBe(
        false,
      );
    });
  });
});
