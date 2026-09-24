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

  describe("updateMatchup", () => {
    const TOURNAMENT_ID = new Types.ObjectId();

    function buildMatchupDoc(overrides: Record<string, unknown> = {}) {
      return {
        stage: new Types.ObjectId(),
        results: [],
        side1: { score: 0 },
        side2: { score: 0 },
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as any;
    }

    function inTournament(matchup: any) {
      matchupRepo.findBySlug.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ tournamentId: TOURNAMENT_ID }),
      );
      return matchup;
    }

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", staff: [] }),
      );

      await expect(
        service.updateMatchup(
          "league-1",
          "tournament-1",
          new Types.ObjectId().toString(),
          "auth0|stranger",
          { matches: [] } as any,
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects a matchup whose stage belongs to another tournament", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      matchupRepo.findBySlug.mockResolvedValue(buildMatchupDoc());
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ tournamentId: new Types.ObjectId() }),
      );

      await expect(
        service.updateMatchup(
          "league-1",
          "tournament-1",
          "someslug",
          "auth0|owner",
          { matches: [] } as any,
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
    });

    it("rebuilds results, dropping pokemon entries with a null/undefined status", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = buildMatchupDoc();
      inTournament(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        {
          matches: [
            {
              link: "  replay-link  ",
              winner: "side1",
              team1: {
                score: 2,
                pokemon: {
                  pikachu: { status: "survived" },
                  mew: { status: null as any },
                },
              },
              team2: { score: 1, pokemon: { mewtwo: { status: "fainted" } } },
            },
          ],
        } as any,
      );

      expect(matchup.results).toEqual([
        {
          replay: "replay-link",
          winner: "side1",
          side1: {
            score: 2,
            pokemon: new Map([["pikachu", { status: "survived" }]]),
          },
          side2: {
            score: 1,
            pokemon: new Map([["mewtwo", { status: "fainted" }]]),
          },
        },
      ]);
      expect(matchup.save).toHaveBeenCalled();
    });

    it("applies dto.score to both sides when given", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = buildMatchupDoc();
      inTournament(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        { matches: [], score: { team1: 3, team2: 1 } } as any,
      );

      expect(matchup.side1.score).toBe(3);
      expect(matchup.side2.score).toBe(1);
    });

    it.each([
      ["side1", { winner: "side1", forfeit: undefined }],
      ["side2", { winner: "side2", forfeit: undefined }],
      ["draw", { winner: "draw", forfeit: undefined }],
      ["side1ffw", { winner: "side1", forfeit: true }],
      ["side2ffw", { winner: "side2", forfeit: true }],
      ["dffl", { winner: "draw", forfeit: true }],
    ])(
      "maps dto.winner %s to matchup {winner, forfeit}",
      async (dtoWinner, expected) => {
        hostedTournamentRepo.findBySlug.mockResolvedValue(
          buildTournament({ id: TOURNAMENT_ID.toString() }),
        );
        const matchup = buildMatchupDoc();
        inTournament(matchup);

        await service.updateMatchup(
          "league-1",
          "tournament-1",
          new Types.ObjectId().toString(),
          "auth0|owner",
          { matches: [], winner: dtoWinner } as any,
        );

        expect(matchup.winner).toBe(expected.winner);
        expect(matchup.forfeit).toBe(expected.forfeit);
      },
    );

    it("returns a confirmation message", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      inTournament(buildMatchupDoc());

      const result = await service.updateMatchup(
        "league-1",
        "tournament-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        { matches: [] } as any,
      );

      expect(result).toEqual({ message: "Schedule updated." });
    });

    it("re-resolves the tournament's bracket after a result is recorded", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const stageId = new Types.ObjectId();
      const matchupId = new Types.ObjectId();
      const matchup = buildMatchupDoc({
        _id: matchupId,
        stage: stageId,
        side1: { score: 0, team: new Types.ObjectId() },
        side2: { score: 0, team: new Types.ObjectId() },
      });
      inTournament(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        matchupId.toString(),
        "auth0|owner",
        { matches: [], winner: "side1" } as any,
      );

      expect(advancement.applyToTournament).toHaveBeenCalledWith(TOURNAMENT_ID);
    });

    it("does not re-resolve when dto.winner is absent", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: TOURNAMENT_ID.toString() }),
      );
      const matchup = buildMatchupDoc({
        _id: new Types.ObjectId(),
        stage: new Types.ObjectId(),
      });
      inTournament(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        { matches: [] } as any,
      );

      expect(advancement.applyToTournament).not.toHaveBeenCalled();
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
