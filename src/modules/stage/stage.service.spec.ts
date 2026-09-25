import { Types } from "mongoose";
import { LeagueMatchupRepository } from "../matchup/sub-modules/league-matchup/league-matchup.repository";
import { HostedTournamentRepository } from "../tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "../tier-list/tier-list.repository";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { getRosterByRound } from "./domain/roster";
import { StageRepository } from "./stage.repository";
import { StageService } from "./stage.service";

jest.mock("./domain/roster", () => ({
  getRosterByRound: jest.fn(),
}));

const mockedGetRosterByRound = getRosterByRound as jest.Mock;

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "tournament-1",
    owner: "auth0|owner",
    staff: [],
    forfeit: { gameDiff: 3 },
    diffMode: "pokemon",
    ...overrides,
  } as any;
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  const team = {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { _id: new Types.ObjectId(), name: "Giovanni" },
    pickLog: [],
    ...overrides,
  };
  const primaryCoach = overrides.primaryCoach ?? team.coach;
  return {
    ...team,
    primaryCoach,
    coaches: overrides.coaches ?? (primaryCoach ? [primaryCoach] : []),
  } as any;
}

function buildStage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(),
    type: "round-robin",
    rounds: [],
    pools: [],
    trades: [],
    seedingLog: [],
    currentRoundIndex: 0,
    ...overrides,
  } as any;
}

describe("StageService", () => {
  let stageRepo: jest.Mocked<StageRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let advancement: jest.Mocked<BracketAdvancementService>;
  let service: StageService;

  beforeEach(() => {
    stageRepo = {
      findAllByTournament: jest.fn(),
      findByIdOrNull: jest.fn(async () => buildStage()),
    } as unknown as jest.Mocked<StageRepository>;
    matchupRepo = {
      findBySlug: jest.fn(),
      findBySlugPopulated: jest.fn(),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    hostedTournamentRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TierListRepository>;
    advancement = {
      applyToTournament: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<BracketAdvancementService>;
    service = new StageService(
      stageRepo,
      matchupRepo,
      hostedTournamentRepo,
      tierListRepo,
      advancement,
    );

    mockedGetRosterByRound.mockReturnValue([]);
  });

  describe("listStages", () => {
    it("maps each stage to a lightweight summary", async () => {
      const tournament = buildTournament();
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const stage = buildStage({
        name: "Regular Season",
        type: "round-robin",
        order: 1,
        currentRoundIndex: 2,
      });
      stageRepo.findAllByTournament.mockResolvedValue([stage]);

      const result = await service.listStages("league-1", "tournament-1");

      expect(result).toEqual([
        {
          _id: stage._id.toString(),
          name: "Regular Season",
          type: "round-robin",
          order: 1,
          currentRoundIndex: 2,
          public: true,
        },
      ]);
    });

    it("hides a non-public stage from anyone but an organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const visible = buildStage({ name: "Regular Season" });
      const hidden = buildStage({ name: "Playoffs" });
      (hidden as any).public = false;
      stageRepo.findAllByTournament.mockResolvedValue([visible, hidden]);

      const anonymous = await service.listStages("league-1", "tournament-1");
      expect(anonymous.map((stage) => stage.name)).toEqual(["Regular Season"]);

      const stranger = await service.listStages(
        "league-1",
        "tournament-1",
        "auth0|stranger",
      );
      expect(stranger.map((stage) => stage.name)).toEqual(["Regular Season"]);

      const organizer = await service.listStages(
        "league-1",
        "tournament-1",
        "auth0|owner",
      );
      expect(organizer.map((stage) => stage.name)).toEqual([
        "Regular Season",
        "Playoffs",
      ]);
      expect(organizer[1].public).toBe(false);
    });
  });

  describe("match reports", () => {
    const TOURNAMENT_ID = new Types.ObjectId();
    const stageId = new Types.ObjectId();

    function setup(overrides: Record<string, unknown> = {}) {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = {
        _id: new Types.ObjectId(),
        slug: "match-1",
        stage: stageId,
        results: [],
        side1: {
          score: 0,
          team: buildTeam({
            coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-1" },
          }),
        },
        side2: {
          score: 0,
          team: buildTeam({
            coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-2" },
          }),
        },
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as any;
      matchupRepo.findBySlugPopulated.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: TOURNAMENT_ID }),
      );
      mockedGetRosterByRound.mockImplementation((team) =>
        team === matchup.side1.team
          ? [{ id: "pikachu" }, { id: "raichu" }]
          : [{ id: "mewtwo" }, { id: "mew" }],
      );
      return matchup;
    }

    function game(
      side1: Record<string, unknown>,
      side2: Record<string, unknown>,
    ) {
      return {
        winner: "side1",
        team1: { score: 2, pokemon: new Map(Object.entries(side1)) },
        team2: { score: 0, pokemon: new Map(Object.entries(side2)) },
      };
    }

    const twoNil = {
      matches: [
        game(
          { pikachu: { status: "survived" } },
          { mewtwo: { status: "fainted" } },
        ),
      ],
    } as any;

    function storedReport(overrides: Record<string, unknown> = {}) {
      return {
        submittedBy: "auth0|coach-2",
        submittedAt: new Date(),
        results: [],
        side1Score: 0,
        side2Score: 2,
        winner: "side2",
        ...overrides,
      };
    }

    it("holds a coach's report for review", async () => {
      const matchup = setup();

      const result = await service.submitMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|coach-1",
        twoNil,
      );

      expect(result.status).toBe("pending");
      expect(matchup.status).toBe("pending");
      expect(matchup.report).toMatchObject({
        side1Score: 1,
        side2Score: 0,
        winner: "side1",
      });
    });

    it("names the co-coach who submitted, not the primary coach", async () => {
      const primary = {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|coach-1",
        name: "Primary",
      };
      const coCoach = {
        _id: new Types.ObjectId(),
        auth0Id: "auth0|co-coach",
        name: "Co-coach",
      };
      const matchup = setup();
      matchup.side1.team = buildTeam({
        primaryCoach: primary,
        coaches: [primary, coCoach],
      });

      await service.submitMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|co-coach",
        twoNil,
      );

      expect(matchup.report).toMatchObject({
        submittedBy: "auth0|co-coach",
        submittedByName: "Co-coach",
      });
    });

    it("stores only the known stat fields for each Pokémon", async () => {
      const matchup = setup();

      await service.submitMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|coach-1",
        {
          matches: [
            game(
              {
                pikachu: {
                  status: "survived",
                  kills: { direct: 2, indirect: 1, teammate: 0 },
                },
              },
              { mewtwo: { status: "fainted" } },
            ),
          ],
        } as any,
      );

      const [result] = matchup.report.results;
      expect(result.side1.pokemon.get("pikachu")).toEqual({
        status: "survived",
        kills: { direct: 2, indirect: 1, teammate: 0 },
      });
      expect(result.side2.pokemon.get("mewtwo")).toEqual({
        status: "fainted",
        kills: undefined,
      });
    });

    it.each([
      ["a coach", "auth0|coach-1"],
      ["an organizer", "auth0|owner"],
    ])(
      "refuses a result from %s crediting a Pokémon off that side's roster",
      async (_, sub) => {
        const matchup = setup();

        await expect(
          service.submitMatchupReport(
            "league-1",
            "tournament-1",
            matchup.slug,
            sub,
            {
              matches: [
                game(
                  { pikachu: { status: "survived", kills: { direct: 6 } } },
                  { mewtwo: { status: "fainted" } },
                ),
                game(
                  { mewtwo: { status: "survived", kills: { direct: 6 } } },
                  { mew: { status: "fainted" } },
                ),
              ],
            } as any,
          ),
        ).rejects.toMatchObject({
          code: "MU-006",
          details: { side: "side1", pokemon: "mewtwo" },
        });
        expect(matchup.save).not.toHaveBeenCalled();
      },
    );

    it("checks the roster at the matchup's own round", async () => {
      const matchup = setup({ round: new Types.ObjectId() });
      const tournamentRound = { _id: matchup.round, name: "Week 2" };
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          id: TOURNAMENT_ID.toString(),
          rounds: [{ _id: new Types.ObjectId(), name: "Week 1" }, tournamentRound],
          currentRoundIndex: 0,
        }),
      );

      await service.submitMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|coach-1",
        twoNil,
      );

      expect(mockedGetRosterByRound).toHaveBeenCalledWith(
        matchup.side1.team,
        expect.anything(),
        1,
      );
    });

    it("refuses a coach's report on a result that is already approved", async () => {
      const matchup = setup({ status: "approved", winner: "side2" });

      await expect(
        service.submitMatchupReport(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|coach-1",
          twoNil,
        ),
      ).rejects.toMatchObject({ code: "MU-005" });
      expect(matchup.status).toBe("approved");
      expect(matchup.save).not.toHaveBeenCalled();
    });

    it("clears a stale forfeit when an organizer records a played result", async () => {
      const matchup = setup({ forfeit: true, winner: "side2" });

      await service.submitMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        twoNil,
      );

      expect(matchup).toMatchObject({
        forfeit: false,
        winner: "side1",
        status: "approved",
      });
      expect(advancement.applyToTournament).toHaveBeenCalledWith(TOURNAMENT_ID);
    });

    it("rejecting a report on an unplayed match leaves it unplayed", async () => {
      const matchup = setup({ status: "pending", report: storedReport() });

      await service.reviewMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        false,
      );

      expect(matchup.status).toBeUndefined();
      expect(matchup.report).toBeUndefined();
    });

    it("rejecting a report restores a result that was already recorded", async () => {
      const matchup = setup({
        status: "pending",
        winner: "side1",
        report: storedReport(),
      });

      await service.reviewMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        false,
      );

      expect(matchup.status).toBe("approved");
      expect(matchup.winner).toBe("side1");
    });

    it("approving a report with no winner takes it from the reported score", async () => {
      const matchup = setup({
        status: "pending",
        winner: "side1",
        report: storedReport({ winner: undefined }),
      });

      await service.reviewMatchupReport(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        true,
      );

      expect(matchup).toMatchObject({
        winner: "side2",
        status: "approved",
        forfeit: false,
      });
    });
  });

  describe("setMatchupSchedule", () => {
    const TOURNAMENT_ID = new Types.ObjectId();
    const stageId = new Types.ObjectId();
    const WHEN = "2026-09-06T02:00:00.000Z";

    function setup() {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = {
        _id: new Types.ObjectId(),
        slug: "match-1",
        stage: stageId,
        results: [],
        side1: {
          score: 0,
          team: buildTeam({ coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-1" } }),
        },
        side2: {
          score: 0,
          team: buildTeam({ coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-2" } }),
        },
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      matchupRepo.findBySlugPopulated.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: TOURNAMENT_ID }),
      );
      return matchup;
    }

    it.each([
      ["a coach on side1", "auth0|coach-1"],
      ["a coach on side2", "auth0|coach-2"],
      ["an organizer", "auth0|owner"],
    ])("lets %s set the time", async (_label, sub) => {
      const matchup = setup();

      const result = await service.setMatchupSchedule(
        "league-1",
        "tournament-1",
        matchup.slug,
        sub,
        { scheduledDate: WHEN },
      );

      expect(matchup.scheduledDate).toEqual(new Date(WHEN));
      expect(matchup.save).toHaveBeenCalled();
      expect(result.scheduledDate).toBe(WHEN);
    });

    it("rejects someone who is neither a coach in the match nor an organizer", async () => {
      const matchup = setup();

      await expect(
        service.setMatchupSchedule(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|stranger",
          { scheduledDate: WHEN },
        ),
      ).rejects.toThrow();
      expect(matchup.save).not.toHaveBeenCalled();
    });

    it("rejects a coach from another match in the same tournament", async () => {
      const matchup = setup();

      await expect(
        service.setMatchupSchedule(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|coach-3",
          { scheduledDate: WHEN },
        ),
      ).rejects.toThrow();
    });

    it("rejects a coach who has left the team", async () => {
      const matchup = setup();
      matchup.side1.team.coaches[0].leftAt = new Date();

      await expect(
        service.setMatchupSchedule(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|coach-1",
          { scheduledDate: WHEN },
        ),
      ).rejects.toThrow();
      expect(matchup.save).not.toHaveBeenCalled();
    });

    it("clears the time on null", async () => {
      const matchup = setup();
      matchup.scheduledDate = new Date(WHEN);

      const result = await service.setMatchupSchedule(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|coach-1",
        { scheduledDate: null },
      );

      expect(matchup.scheduledDate).toBeUndefined();
      expect(result.scheduledDate).toBeNull();
    });

    it("refuses a matchup that belongs to another tournament", async () => {
      const matchup = setup();
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: new Types.ObjectId() }),
      );

      await expect(
        service.setMatchupSchedule(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|owner",
          { scheduledDate: WHEN },
        ),
      ).rejects.toThrow();
    });
  });

  describe("setMatchupNotes", () => {
    const TOURNAMENT_ID = new Types.ObjectId();
    const stageId = new Types.ObjectId();

    function setup() {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = {
        _id: new Types.ObjectId(),
        slug: "match-1",
        stage: stageId,
        results: [],
        side1: {
          score: 0,
          team: buildTeam({ coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-1" } }),
        },
        side2: {
          score: 0,
          team: buildTeam({ coach: { _id: new Types.ObjectId(), auth0Id: "auth0|coach-2" } }),
        },
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      matchupRepo.findBySlugPopulated.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: TOURNAMENT_ID }),
      );
      return matchup;
    }

    it.each([
      ["side1", "auth0|coach-1", "side2"],
      ["side2", "auth0|coach-2", "side1"],
    ])(
      "writes a coach's notes to %s and leaves the other side alone",
      async (side, sub, otherSide) => {
        const matchup = setup();

        await service.setMatchupNotes("league-1", "tournament-1", matchup.slug, sub, {
          notes: "  lead flutter mane  ",
        });

        expect(matchup[side].notes).toBe("lead flutter mane");
        expect(matchup[otherSide].notes).toBeUndefined();
        expect(matchup.save).toHaveBeenCalled();
      },
    );

    it("clears the notes on an empty string", async () => {
      const matchup = setup();
      matchup.side1.notes = "old";

      await service.setMatchupNotes(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|coach-1",
        { notes: "   " },
      );

      expect(matchup.side1.notes).toBeUndefined();
    });

    it("rejects an organizer who is not a coach in the match", async () => {
      const matchup = setup();

      await expect(
        service.setMatchupNotes(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|owner",
          { notes: "peeking" },
        ),
      ).rejects.toThrow();
      expect(matchup.save).not.toHaveBeenCalled();
    });

    it("rejects a coach from another match", async () => {
      const matchup = setup();

      await expect(
        service.setMatchupNotes(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|coach-3",
          { notes: "peeking" },
        ),
      ).rejects.toThrow();
      expect(matchup.save).not.toHaveBeenCalled();
    });
  });

  describe("setMatchupAdvancement", () => {
    const TOURNAMENT_ID = new Types.ObjectId();
    const stageId = new Types.ObjectId();

    function setup() {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = {
        _id: new Types.ObjectId(),
        slug: "match-1",
        stage: stageId,
        results: [],
        side1: { score: 0 },
        side2: { score: 0 },
        winner: "draw",
        forfeit: true,
        save: jest.fn().mockResolvedValue(undefined),
      } as any;
      matchupRepo.findBySlug.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: TOURNAMENT_ID }),
      );
      return matchup;
    }

    it("records the side an organizer advances out of a double forfeit", async () => {
      const matchup = setup();

      const result = await service.setMatchupAdvancement(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        "side1",
      );

      expect(matchup.advances).toBe("side1");
      expect(matchup.save).toHaveBeenCalled();
      expect(advancement.applyToTournament).toHaveBeenCalledWith(TOURNAMENT_ID);
      expect(result.advances).toBe("side1");
    });

    it('stores "none" as a decision rather than as an unset field', async () => {
      const matchup = setup();

      await service.setMatchupAdvancement(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        "none",
      );

      expect(matchup.advances).toBe("none");
    });

    it("clears the override on null, putting the bracket back on the result", async () => {
      const matchup = setup();
      matchup.advances = "side2";

      const result = await service.setMatchupAdvancement(
        "league-1",
        "tournament-1",
        matchup.slug,
        "auth0|owner",
        null,
      );

      expect(matchup.advances).toBeUndefined();
      expect(result.advances).toBeNull();
    });

    it("rejects a non-organizer", async () => {
      const matchup = setup();

      await expect(
        service.setMatchupAdvancement(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|stranger",
          "side1",
        ),
      ).rejects.toThrow();
    });

    it("refuses a matchup that belongs to another tournament", async () => {
      const matchup = setup();
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ _id: stageId, tournamentId: new Types.ObjectId() }),
      );

      await expect(
        service.setMatchupAdvancement(
          "league-1",
          "tournament-1",
          matchup.slug,
          "auth0|owner",
          "side1",
        ),
      ).rejects.toThrow();
    });
  });
});
