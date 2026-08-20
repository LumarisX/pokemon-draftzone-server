import { Types } from "mongoose";
import { LeagueMatchupRepository } from "../matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "../team/team.repository";
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
    organizers: [],
    forfeit: { gameDiff: 3 },
    diffMode: "pokemon",
    ...overrides,
  } as any;
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { name: "Giovanni" },
    pickLog: [],
    ...overrides,
  } as any;
}

function buildStage(overrides: Record<string, unknown> = {}) {
  const stage: any = {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(),
    type: "round-robin",
    rounds: [],
    pools: [],
    trades: [],
    seedingLog: [],
    currentRoundIndex: 0,
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  // Mimics mongoose subdocument casting: assigned rounds get _ids.
  stage.set = jest.fn((key: string, value: unknown) => {
    stage[key] =
      key === "rounds"
        ? (value as object[]).map((round) => ({
            ...round,
            _id: new Types.ObjectId(),
          }))
        : value;
  });
  return stage;
}

describe("StageService", () => {
  let stageRepo: jest.Mocked<StageRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let advancement: jest.Mocked<BracketAdvancementService>;
  let service: StageService;

  beforeEach(() => {
    stageRepo = {
      create: jest.fn(),
      findAllByTournament: jest.fn(),
      setPools: jest.fn(),
      setCurrentRoundIndex: jest.fn(),
      setPublic: jest.fn(),
      findById: jest.fn(async () => buildStage()),
      findByIdOrNull: jest.fn(async () => buildStage()),
      findBySlug: jest.fn(async () => buildStage()),
      teamIdsInSeedOrder: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<StageRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    matchupRepo = {
      findByRoundsInStage: jest.fn().mockResolvedValue([]),
      findByRounds: jest.fn().mockResolvedValue([]),
      findBySlug: jest.fn(),
      findBySlugPopulated: jest.fn(),
      countByStage: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue([]),
      deleteByStage: jest.fn().mockResolvedValue(0),
      resolveDownstreamSlots: jest.fn().mockResolvedValue(undefined),
      findStructureByStage: jest.fn().mockResolvedValue([]),
      applyStructureDiff: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    hostedTournamentRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    tierListRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<TierListRepository>;
    advancement = {
      applyToTournament: jest.fn().mockResolvedValue(0),
      applyToStages: jest.fn().mockResolvedValue(0),
      findBlocked: jest.fn().mockResolvedValue(new Set<string>()),
    } as unknown as jest.Mocked<BracketAdvancementService>;
    service = new StageService(
      stageRepo,
      teamRepo,
      matchupRepo,
      hostedTournamentRepo,
      tierListRepo,
      advancement,
    );

    mockedGetRosterByRound.mockReturnValue([]);
  });

  describe("createStage", () => {
    it("creates the stage when sub is the tournament owner", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const created = buildStage();
      stageRepo.create.mockResolvedValue(created);

      const result = await service.createStage(
        "league-1",
        "tournament-1",
        "auth0|owner",
        {
          order: 1,
          name: "Regular Season",
          type: "round-robin",
        },
      );

      expect(stageRepo.create).toHaveBeenCalledWith({
        tournamentId: tournament.id,
        order: 1,
        name: "Regular Season",
        type: "round-robin",
        public: undefined,
        rounds: undefined,
      });
      expect(result).toBe(created);
    });

    it("allows an organizer (not just the owner) to create a stage", async () => {
      const tournament = buildTournament({
        owner: "auth0|owner",
        organizers: ["auth0|deputy"],
      });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      stageRepo.create.mockResolvedValue(buildStage());

      await expect(
        service.createStage("league-1", "tournament-1", "auth0|deputy", {
          order: 1,
          name: "Regular Season",
          type: "round-robin",
        }),
      ).resolves.toBeDefined();
    });

    it("rejects a non-organizer, non-owner sub", async () => {
      const tournament = buildTournament({
        owner: "auth0|owner",
        organizers: [],
      });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);

      await expect(
        service.createStage("league-1", "tournament-1", "auth0|stranger", {
          order: 1,
          name: "Regular Season",
          type: "round-robin",
        }),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(stageRepo.create).not.toHaveBeenCalled();
    });
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

  describe("setVisibility", () => {
    it("flips the flag for an organizer", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const stage = buildStage({
        tournamentId: { equals: (id: unknown) => id === tournament.id },
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      stageRepo.setPublic.mockResolvedValue({ ...stage, public: false } as any);

      await service.setVisibility(
        "league-1",
        "tournament-1",
        stage._id.toString(),
        "auth0|owner",
        { public: false },
      );

      expect(stageRepo.setPublic).toHaveBeenCalledWith(stage._id, false);
    });

    it("rejects a non-organizer", async () => {
      const tournament = buildTournament({
        owner: "auth0|owner",
        organizers: [],
      });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);

      await expect(
        service.setVisibility(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|stranger",
          { public: false },
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
      expect(stageRepo.setPublic).not.toHaveBeenCalled();
    });
  });

  describe("setPools", () => {
    it("rejects an invalid team ID inside a pool before touching the repository", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());

      await expect(
        service.setPools("league-1", "tournament-1", "stage-1", "auth0|owner", {
          pools: [
            { poolKey: "A", name: "Pool A", teamIds: ["not-an-object-id"] },
          ],
        }),
      ).rejects.toMatchObject({ code: "VAL-002" });
      expect(stageRepo.setPools).not.toHaveBeenCalled();
    });

    it("converts valid team IDs to ObjectIds and forwards to the repository", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const teamId = new Types.ObjectId().toString();
      const stage = buildStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      stageRepo.setPools.mockResolvedValue(buildStage());

      await service.setPools(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        {
          pools: [{ poolKey: "A", name: "Pool A", teamIds: [teamId] }],
        },
      );

      expect(stageRepo.setPools).toHaveBeenCalledWith(stage._id, [
        { poolKey: "A", name: "Pool A", teamIds: [new Types.ObjectId(teamId)] },
      ]);
    });

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.setPools(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|stranger",
          {
            pools: [],
          },
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });
  });

  describe("advanceCurrentRound", () => {
    it("forwards to the repository when sub is the organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      const updated = buildStage({ currentRoundIndex: 3 });
      stageRepo.setCurrentRoundIndex.mockResolvedValue(updated);

      const result = await service.advanceCurrentRound(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        { currentRoundIndex: 3 },
      );

      expect(stageRepo.setCurrentRoundIndex).toHaveBeenCalledWith(stage._id, 3);
      expect(result).toBe(updated);
    });

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.advanceCurrentRound(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|stranger",
          {
            currentRoundIndex: 1,
          },
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });
  });

  describe("getSchedule", () => {
    function buildMatchup(overrides: Record<string, unknown> = {}) {
      return {
        _id: new Types.ObjectId(),
        round: new Types.ObjectId(),
        side1: { team: buildTeam({ teamName: "Team A" }), score: 2 },
        side2: { team: buildTeam({ teamName: "Team B" }), score: 1 },
        results: [],
        winner: "side1",
        forfeit: false,
        ...overrides,
      } as any;
    }

    it("returns every round's matchups when no round filter is given", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const round1 = { _id: new Types.ObjectId(), name: "Week 2" };
      const stage = buildStage({
        rounds: [round0, round1],
        currentRoundIndex: 1,
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);

      const result = await service.getSchedule(stage._id.toString());

      expect(result.rounds.map((r: any) => r.name)).toEqual([
        "Week 1",
        "Week 2",
      ]);
      expect(result.currentRoundIndex).toBe(1);
    });

    it("restricts to only the current round when roundFilter is 'current'", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const round1 = { _id: new Types.ObjectId(), name: "Week 2" };
      const stage = buildStage({
        rounds: [round0, round1],
        currentRoundIndex: 1,
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);

      const result = await service.getSchedule(
        stage._id.toString(),
        undefined,
        "current",
      );

      expect(result.rounds).toHaveLength(1);
      expect(result.rounds[0].name).toBe("Week 2");
      expect(matchupRepo.findByRoundsInStage).toHaveBeenCalledWith(
        stage._id,
        [round1._id],
        undefined,
      );
    });

    it("forwards a normalized teamId filter to the repository", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const stage = buildStage({ rounds: [round0] });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);
      const teamId = new Types.ObjectId().toString();

      await service.getSchedule(stage._id.toString(), [
        teamId,
        "not-an-object-id",
        "",
      ]);

      expect(matchupRepo.findByRoundsInStage).toHaveBeenCalledWith(
        stage._id,
        [round0._id],
        {
          teamIds: [new Types.ObjectId(teamId)],
        },
      );
    });

    it("omits rounds the filtered team has no matchups in", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const round1 = { _id: new Types.ObjectId(), name: "Week 2" };
      const stage = buildStage({ rounds: [round0, round1] });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      const team = buildTeam({ teamName: "Team A" });
      matchupRepo.findByRoundsInStage.mockResolvedValue([
        buildMatchup({ round: round1._id, side1: { team, score: 0 } }),
      ]);
      mockedGetRosterByRound.mockReturnValue([]);

      const result = await service.getSchedule(
        stage._id.toString(),
        team._id.toString(),
      );

      expect(result.rounds.map((r: any) => r.name)).toEqual(["Week 2"]);
    });

    it("transforms a matchup's score/winner/draft fields for a normal (non-forfeit) result", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const stage = buildStage({ rounds: [round0] });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      const team1 = buildTeam({ teamName: "Team A" });
      const team2 = buildTeam({ teamName: "Team B" });
      const matchup = buildMatchup({
        round: round0._id,
        side1: { team: team1, score: 2 },
        side2: { team: team2, score: 1 },
        winner: "side1",
        forfeit: false,
        results: [
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
        ],
      });
      matchupRepo.findByRoundsInStage.mockResolvedValue([matchup]);
      mockedGetRosterByRound.mockReturnValue([
        { id: "pikachu", addons: ["Tera Captain"] },
      ]);

      const result = await service.getSchedule(stage._id.toString());

      const transformed = result.rounds[0].matchups[0];
      expect(transformed.team1).toMatchObject({
        name: "Team A",
        coach: "Giovanni",
        score: 2,
        id: team1._id.toString(),
        draft: [{ id: "pikachu", capt: { tera: true } }],
      });
      expect(transformed.score).toEqual({ team1: 2, team2: 1 });
      expect(transformed.winner).toBe("side1");
      expect(transformed.matches[0]).toEqual({
        link: "replay-link",
        team1: {
          team: { pikachu: { status: "survived" } },
          score: 2,
          winner: true,
        },
        team2: {
          team: { mewtwo: { status: "fainted" } },
          score: 1,
          winner: false,
        },
      });
    });

    it("substitutes the tournament's forfeit.gameDiff for the winning side's score on a forfeit", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const stage = buildStage({ rounds: [round0] });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(
        buildTournament({ forfeit: { gameDiff: 3 } }),
      );
      const matchup = buildMatchup({
        round: round0._id,
        winner: "side1",
        forfeit: true,
      });
      matchupRepo.findByRoundsInStage.mockResolvedValue([matchup]);

      const result = await service.getSchedule(stage._id.toString());

      const transformed = result.rounds[0].matchups[0];
      expect(transformed.team1.score).toBe(3);
      expect(transformed.team2.score).toBe(0);
      expect(transformed.winner).toBe("side1ffw");
    });
  });

  describe("getTrades", () => {
    function buildTradeFixture(overrides: Record<string, unknown> = {}) {
      return {
        side1: {
          team: buildTeam({ teamName: "Team A" }),
          pokemon: [{ id: "pikachu" }],
        },
        side2: {
          team: buildTeam({ teamName: "Team B" }),
          pokemon: [{ id: "mewtwo" }],
        },
        activeRound: 0,
        timestamp: new Date(),
        status: "APPROVED",
        ...overrides,
      };
    }

    /**
     * Serves the trades' teams through the team repository.
     *
     * getTrades resolves trade teams by id rather than by Mongoose populate,
     * because the trades it reads may be the tournament's — a domain object
     * with no document to populate.
     */
    function mockTradeTeams(trades: Record<string, any>[]) {
      const teams = trades.flatMap((trade) =>
        [trade.side1?.team, trade.side2?.team].filter(Boolean),
      );
      teamRepo.findManyByIds.mockImplementation(async (ids: any[]) => {
        const wanted = new Set(ids.map(String));
        return teams.filter((team) => wanted.has(team._id.toString()));
      });
    }

    it("buckets each trade into its active round's bucket", async () => {
      const trade = buildTradeFixture({ activeRound: 1 });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }, { name: "Week 2" }],
        trades: [trade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades).toEqual([]);
      expect(result.rounds[1].trades).toHaveLength(1);
      expect(result.rounds[1].trades[0]).toMatchObject({
        activeRound: 1,
        status: "APPROVED",
        side1: {
          team: { name: "Team A" },
          pokemon: [{ id: "pikachu", name: "Pikachu", tera: false }],
        },
      });
    });

    it("includes trades regardless of status (pending/approved/rejected)", async () => {
      const trade = buildTradeFixture({ status: "PENDING" });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [trade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades[0]).toMatchObject({ status: "PENDING" });
    });

    it("drops trades whose activeRound is out of bounds for the stage's rounds", async () => {
      const trade = buildTradeFixture({ activeRound: -1 });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [trade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades).toEqual([]);
    });

    it("flags a trade's Pokemon as a Tera Captain pick when addons include it", async () => {
      const trade = buildTradeFixture({
        side1: {
          team: buildTeam(),
          pokemon: [{ id: "charizard", addons: ["Tera Captain"] }],
        },
      });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [trade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect((result.rounds[0].trades[0] as any).side1.pokemon[0]).toEqual({
        id: "charizard",
        name: "Charizard",
        tera: true,
      });
    });

    it("filters to only trades involving the given teamId", async () => {
      const teamA = buildTeam({ teamName: "Team A" });
      const teamB = buildTeam({ teamName: "Team B" });
      const teamC = buildTeam({ teamName: "Team C" });
      const matchingTrade = buildTradeFixture({
        side1: { team: teamA, pokemon: [] },
        side2: { team: teamB, pokemon: [] },
      });
      const nonMatchingTrade = buildTradeFixture({
        side1: { team: teamB, pokemon: [] },
        side2: { team: teamC, pokemon: [] },
      });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [matchingTrade, nonMatchingTrade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(
        stage._id.toString(),
        teamA._id.toString(),
      );

      expect(result.rounds[0].trades).toHaveLength(1);
    });

    it("represents a bye side (no team) with an undefined team field", async () => {
      const trade = buildTradeFixture({
        side2: { team: undefined, pokemon: [] },
      });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [trade],
      });
      mockTradeTeams(stage.trades);
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect((result.rounds[0].trades[0] as any).side2.team).toBeUndefined();
    });
  });

  /**
   * A stage created by the sections-to-stages migration carries no rounds,
   * pools or trades of its own — those moved to the tournament. Reads have to
   * find them there, and stage-scoped writes have to refuse rather than write
   * somewhere nothing will look again.
   */
  describe("a stage on a tournament-wide round axis", () => {
    const tournamentRound = (name: string) => ({
      _id: new Types.ObjectId(),
      name,
    });

    /** As the migration leaves it: teams, and nothing else. */
    function buildMigratedStage(overrides: Record<string, unknown> = {}) {
      return buildStage({
        rounds: [],
        pools: [],
        trades: [],
        teamIds: [new Types.ObjectId(), new Types.ObjectId()],
        currentRoundIndex: -1,
        ...overrides,
      });
    }

    it("reads the bracket against the tournament's rounds, not the stage's", async () => {
      const rounds = [tournamentRound("Week 1"), tournamentRound("Week 2")];
      const stage = buildMigratedStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(
        buildTournament({ rounds }),
      );
      teamRepo.findManyByIds.mockResolvedValue([]);
      matchupRepo.findByRoundsInStage.mockResolvedValue([] as any);

      const result = await service.getBracket(stage._id.toString());

      expect(result.rounds.map((r) => r.name)).toEqual(["Week 1", "Week 2"]);
      // Scoped to the stage as well: the rounds are shared, so querying by
      // round alone would return every other stage's matchups too.
      expect(matchupRepo.findByRoundsInStage).toHaveBeenCalledWith(
        stage._id,
        rounds.map((r) => r._id),
      );
    });

    it("takes the stage's teams from teamIds when it has no pools", async () => {
      const stage = buildMigratedStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(
        buildTournament({ rounds: [tournamentRound("Week 1")] }),
      );
      teamRepo.findManyByIds.mockResolvedValue([]);
      matchupRepo.findByRoundsInStage.mockResolvedValue([] as any);

      await service.getBracket(stage._id.toString());

      expect(teamRepo.findManyByIds).toHaveBeenCalledWith(stage.teamIds);
    });

    it("serves the tournament's trades, not the stage's leftover copy", async () => {
      // A single-section stage keeps its `_id` — and therefore its old trades —
      // through the migration. Reading both would double every roster change.
      const teamA = buildTeam({ teamName: "Team A" });
      const teamB = buildTeam({ teamName: "Team B" });
      const stage = buildMigratedStage({
        trades: [
          {
            _id: new Types.ObjectId(),
            side1: { team: teamA._id, pokemon: [{ id: "pikachu" }] },
            side2: { team: teamB._id, pokemon: [] },
            timestamp: new Date(),
            activeRound: 0,
            status: "APPROVED",
          },
        ],
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(
        buildTournament({
          rounds: [tournamentRound("Week 1")],
          trades: [
            {
              _id: new Types.ObjectId(),
              side1: { team: teamA._id, pokemon: [{ id: "mewtwo" }] },
              side2: { team: teamB._id, pokemon: [] },
              timestamp: new Date(),
              activeRound: 0,
              status: "APPROVED",
            },
          ],
        }),
      );
      teamRepo.findManyByIds.mockResolvedValue([teamA, teamB]);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades).toHaveLength(1);
      expect((result.rounds[0].trades[0] as any).side1.pokemon[0].id).toBe(
        "mewtwo",
      );
    });

    it.each([
      [
        "generateBracket",
        (service: StageService, stageId: string) =>
          service.generateBracket("league-1", "tournament-1", stageId, "auth0|owner", {
            rounds: [{ name: "Week 1" }],
            matches: [],
            teamIds: [],
          } as any),
      ],
      [
        "updateBracket",
        (service: StageService, stageId: string) =>
          service.updateBracket("league-1", "tournament-1", stageId, "auth0|owner", {
            rounds: [{ name: "Week 1" }],
            matches: [],
          } as any),
      ],
      [
        "advanceCurrentRound",
        (service: StageService, stageId: string) =>
          service.advanceCurrentRound(
            "league-1",
            "tournament-1",
            stageId,
            "auth0|owner",
            { currentRoundIndex: 1 } as any,
          ),
      ],
      [
        "createTrade",
        (service: StageService, stageId: string) =>
          service.createTrade("league-1", "tournament-1", stageId, "auth0|owner", {
            side1: { team: undefined, pokemon: [] },
            side2: { team: undefined, pokemon: [] },
            roundIndex: 0,
          } as any),
      ],
    ])(
      "refuses %s, which would write to a schedule the tournament owns",
      async (_name, call) => {
        // The bracket paths check stage ownership before the guard, so the
        // stage has to genuinely belong to this tournament for the guard to be
        // what rejects.
        const tournamentId = new Types.ObjectId();
        const stage = buildMigratedStage({ tournamentId });
        stageRepo.findBySlug.mockResolvedValue(stage);
        hostedTournamentRepo.findBySlug.mockResolvedValue(
          buildTournament({
            id: tournamentId.toString(),
            rounds: [tournamentRound("Week 1")],
          }),
        );

        await expect(call(service, stage._id.toString())).rejects.toMatchObject({
          code: "STG-007",
        });
      },
    );
  });

  describe("createTrade", () => {
    function buildTradeDto(overrides: Record<string, unknown> = {}) {
      return {
        side1: { team: undefined, pokemon: [] },
        side2: { team: undefined, pokemon: [] },
        roundIndex: 0,
        ...overrides,
      } as any;
    }

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|stranger",
          buildTradeDto(),
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects an invalid side1 team id", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      stageRepo.findBySlug.mockResolvedValue(buildStage());

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          buildTradeDto({ side1: { team: "not-an-object-id", pokemon: [] } }),
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("rejects an invalid side2 team id", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      stageRepo.findBySlug.mockResolvedValue(buildStage());

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          buildTradeDto({ side2: { team: "not-an-object-id", pokemon: [] } }),
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("does nothing (but still reports success) when neither side names a team", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findBySlug.mockResolvedValue(stage);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        buildTradeDto(),
      );

      expect(stage.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: "Trade processed successfully.",
        status: "APPROVED",
      });
    });

    it("throws TEAM.NOT_FOUND when side1's team doesn't exist", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      stageRepo.findBySlug.mockResolvedValue(buildStage());
      teamRepo.findByIdOrNull.mockResolvedValue(null);
      const teamId = new Types.ObjectId().toString();

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          buildTradeDto({
            side1: { team: teamId, pokemon: [{ id: "pikachu", tera: false }] },
          }),
        ),
      ).rejects.toMatchObject({ code: "LR-TEAM-001" });
    });

    it("throws SPECIES.NOT_FOUND when a side offers a Pokemon not on that team's current roster", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      const team1 = buildTeam();
      teamRepo.findByIdOrNull.mockResolvedValue(team1);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu" }]);

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          buildTradeDto({
            side1: {
              team: team1._id.toString(),
              pokemon: [{ id: "mewtwo", tera: false }],
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "SPC-001" });
    });

    it("records an APPROVED trade and saves the stage on a valid request", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findBySlug.mockResolvedValue(stage);
      const team1 = buildTeam();
      const team2 = buildTeam();
      teamRepo.findByIdOrNull.mockImplementation((id) =>
        Promise.resolve(id === team1._id ? team1 : team2),
      );
      mockedGetRosterByRound.mockReturnValue([
        { id: "pikachu" },
        { id: "charizard" },
      ]);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        buildTradeDto({
          side1: {
            team: team1._id.toString(),
            pokemon: [{ id: "pikachu", tera: true }],
          },
          side2: {
            team: team2._id.toString(),
            pokemon: [{ id: "charizard", tera: false }],
          },
          roundIndex: 2,
        }),
      );

      expect(stage.trades).toHaveLength(1);
      expect(stage.trades[0]).toMatchObject({
        side1: {
          team: team1._id,
          pokemon: [{ id: "pikachu", addons: ["Tera Captain"] }],
        },
        side2: {
          team: team2._id,
          pokemon: [{ id: "charizard", addons: undefined }],
        },
        activeRound: 2,
        status: "APPROVED",
      });
      expect(stage.save).toHaveBeenCalled();
      expect(result).toEqual({
        message: "Trade processed successfully.",
        status: "APPROVED",
      });
    });
  });

  describe("trade points", () => {
    function coachedTeam(sub: string, overrides: Record<string, unknown> = {}) {
      return buildTeam({
        coach: { name: "Giovanni", auth0Id: sub },
        pickLog: [{ pokemon: { id: "pikachu" } }],
        ...overrides,
      });
    }

    it("records a coach-submitted trade as PENDING with its trade points", async () => {
      const tournament = buildTournament({ organizers: [] });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const team = coachedTeam("auth0|coach");
      const stage = buildStage({ rounds: [{ name: "Week 1" }] });
      stageRepo.findBySlug.mockResolvedValue(stage);
      teamRepo.findManyByIds.mockResolvedValue([team]);
      teamRepo.findByIdOrNull.mockResolvedValue(team);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu" }]);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|coach",
        {
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: false }],
            tradePoints: 3,
          },
          side2: { pokemon: [], tradePoints: 9 },
          roundIndex: 0,
        } as any,
      );

      expect(result.status).toBe("PENDING");
      expect(stage.trades[0]).toMatchObject({
        status: "PENDING",
        side1: { tradePoints: 3 },
        // A side with no team is free agency and is never charged.
        side2: { tradePoints: 0 },
      });
    });

    it("rejects a coach filing a trade their team is not part of", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ organizers: [] }),
      );
      stageRepo.findBySlug.mockResolvedValue(buildStage());
      teamRepo.findManyByIds.mockResolvedValue([coachedTeam("auth0|someone")]);

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|other",
          {
            side1: { team: new Types.ObjectId().toString(), pokemon: [] },
            side2: { pokemon: [] },
            roundIndex: 0,
          } as any,
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("blocks an organizer trade that would push a team over the limit", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ tradePointLimit: 4 }),
      );
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [
          {
            _id: new Types.ObjectId(),
            status: "APPROVED",
            activeRound: 0,
            side1: { team: team._id, pokemon: [], tradePoints: 3 },
            side2: { pokemon: [], tradePoints: 0 },
          },
        ],
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      teamRepo.findByIdOrNull.mockResolvedValue(team);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu" }]);

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          {
            side1: {
              team: team._id.toString(),
              pokemon: [{ id: "pikachu", tera: false }],
              tradePoints: 2,
            },
            side2: { pokemon: [] },
            roundIndex: 0,
          } as any,
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("does not count the trade being approved against its own limit twice", async () => {
      const team = buildTeam({ pickLog: [{ pokemon: { id: "pikachu" } }] });
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ tradePointLimit: 4 }),
      );
      const tradeId = new Types.ObjectId();
      const pending = {
        _id: tradeId,
        status: "PENDING" as const,
        activeRound: 0,
        side1: { team: team._id, pokemon: [], tradePoints: 4 },
        side2: { pokemon: [], tradePoints: 0 },
      };
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [pending],
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      teamRepo.findByIdOrNull.mockResolvedValue(team);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu" }]);

      const result = await service.setTradeStatus(
        "league-1",
        "tournament-1",
        "stage-1",
        tradeId.toString(),
        "auth0|owner",
        { status: "APPROVED" },
      );

      expect(result.status).toBe("APPROVED");
      expect(pending.status).toBe("APPROVED");
    });

    it("refuses to re-resolve a trade that is already settled", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      const tradeId = new Types.ObjectId();
      const stage = buildStage({
        rounds: [{ name: "Week 1" }],
        trades: [
          {
            _id: tradeId,
            status: "APPROVED",
            activeRound: 0,
            side1: { pokemon: [] },
            side2: { pokemon: [] },
          },
        ],
      });
      stageRepo.findBySlug.mockResolvedValue(stage);

      await expect(
        service.setTradeStatus(
          "league-1",
          "tournament-1",
          "stage-1",
          tradeId.toString(),
          "auth0|owner",
          { status: "REJECTED" },
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
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

    /** A matchup whose stage belongs to the tournament being addressed. */
    function inTournament(matchup: any) {
      matchupRepo.findBySlug.mockResolvedValue(matchup);
      stageRepo.findByIdOrNull.mockResolvedValue(
        buildStage({ tournamentId: TOURNAMENT_ID }),
      );
      return matchup;
    }

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
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

    // The slug is unique collection-wide, so it names a match without saying
    // which tournament owns it — organizing one tournament must not authorize
    // a write to another's results.
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

      // The whole tournament, not just this match's slots: a correction has to
      // travel past the next match into everything resolved behind it, and the
      // slot consuming this result may live in a later stage entirely.
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

  describe("setMatchupAdvancement", () => {
    const TOURNAMENT_ID = new Types.ObjectId();
    const stageId = new Types.ObjectId();

    /** A double-forfeited match in a stage of the tournament being addressed. */
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

  describe("generateBracket", () => {
    const teamIds = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];

    /** 3-team double elim wired by the client generator. */
    const bracketDto = (seedingMethod: "certified-random" | "manual") =>
      ({
        seedingMethod,
        teamIds,
        rounds: [
          { name: "WB Round 1" },
          { name: "WB Finals" },
          { name: "LB Finals" },
          { name: "Grand Finals" },
        ],
        matches: [
          {
            key: "w1-1",
            roundIndex: 0,
            section: "winners",
            bracketRound: 0,
            position: 1,
            a: { type: "seed", seed: 2 },
            b: { type: "seed", seed: 3 },
          },
          {
            key: "w2-0",
            roundIndex: 1,
            section: "winners",
            bracketRound: 1,
            position: 0,
            a: { type: "seed", seed: 1 },
            b: { type: "winner", from: "w1-1" },
          },
          {
            key: "l2-0",
            roundIndex: 2,
            section: "losers",
            bracketRound: 0,
            position: 0,
            a: { type: "loser", from: "w1-1" },
            b: { type: "loser", from: "w2-0" },
          },
          {
            key: "gf",
            roundIndex: 3,
            section: "finals",
            bracketRound: 0,
            position: 0,
            label: "Grand Finals",
            a: { type: "winner", from: "w2-0" },
            b: { type: "winner", from: "l2-0" },
          },
        ],
      }) as any;

    function setupBracketStage() {
      const tournamentId = new Types.ObjectId();
      const tournament = buildTournament({ id: tournamentId.toString() });
      hostedTournamentRepo.findBySlug.mockResolvedValue(tournament);
      const stage = buildStage({
        tournamentId,
        type: "double-elimination",
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      teamRepo.findManyByIds.mockResolvedValue(
        teamIds.map((id) => buildTeam({ _id: new Types.ObjectId(id) })),
      );
      return stage;
    }

    it("persists a certified-random bracket: shuffled pools, seeding record, wired matchups", async () => {
      const stage = setupBracketStage();

      const result = await service.generateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        bracketDto("certified-random"),
      );

      // Pool order is a permutation of the participants, decided server-side.
      expect(stage.pools).toHaveLength(1);
      const poolIds = stage.pools[0].teamIds.map(String);
      expect([...poolIds].sort()).toEqual([...teamIds].sort());
      expect(stage.save).toHaveBeenCalled();

      expect(stage.seedingLog).toHaveLength(1);
      expect(stage.seedingLog[0]).toMatchObject({
        method: "certified-random",
        seededBy: "auth0|owner",
        algorithmVersion: "fisher-yates-csprng-v1",
      });
      expect(stage.seedingLog[0].inputTeamsHash).toMatch(/^[0-9a-f]{64}$/);

      const inserted = (matchupRepo.createMany as jest.Mock).mock.calls[0][0];
      expect(inserted).toHaveLength(4);
      const byKey = new Map(
        (bracketDto("manual").matches as { key: string }[]).map((m, i) => [
          m.key,
          inserted[i],
        ]),
      );
      // Winner/loser slots reference the pre-assigned _ids of their sources.
      expect(byKey.get("gf").side1.slot).toEqual({
        type: "winner",
        matchId: byKey.get("w2-0")._id.toString(),
      });
      expect(byKey.get("l2-0").side1.slot).toEqual({
        type: "loser",
        matchId: byKey.get("w1-1")._id.toString(),
      });
      // Seed slots are materialized with the seeded team.
      expect(byKey.get("w2-0").side1.slot).toEqual({ type: "seed", seed: 1 });
      expect(byKey.get("w2-0").side1.team.toString()).toBe(poolIds[0]);
      // Rounds map through the stage's newly-created subdocuments.
      expect(byKey.get("gf").round).toBe(stage.rounds[3]._id);
      expect(byKey.get("gf").section).toBe("finals");
      expect(byKey.get("gf").label).toBe("Grand Finals");

      expect(result.seeding?.method).toBe("certified-random");
      expect(result.seeding?.timesSeeded).toBe(1);
      expect(result.seedOrder).toEqual(poolIds);
      expect(Object.keys(result.matchIds).sort()).toEqual([
        "gf",
        "l2-0",
        "w1-1",
        "w2-0",
      ]);
    });

    it("persists a manual bracket with the submitted order as the seeding", async () => {
      const stage = setupBracketStage();

      const result = await service.generateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        bracketDto("manual"),
      );

      expect(result.seedOrder).toEqual(teamIds);
      expect(stage.pools[0].teamIds.map(String)).toEqual(teamIds);
      expect(stage.seedingLog[0]).toMatchObject({ method: "manual" });
      expect(stage.seedingLog[0].inputTeamsHash).toBeUndefined();
    });

    describe("seed groups", () => {
      const groupTeamIds = Array.from({ length: 4 }, () =>
        new Types.ObjectId().toString(),
      );

      /** Two independent 2-team sections, each owning half the seed numbers. */
      const groupedDto = (
        methods: ["certified-random" | "manual", "certified-random" | "manual"],
      ) =>
        ({
          seedGroups: [
            {
              teamIds: groupTeamIds.slice(0, 2),
              method: methods[0],
              label: "Group A",
            },
            {
              teamIds: groupTeamIds.slice(2),
              method: methods[1],
              label: "Group B",
            },
          ],
          rounds: [{ name: "Group A — Round 1" }, { name: "Group B — Round 1" }],
          sections: [
            { key: "group-a--rr", kind: "round-robin", label: "Group A" },
            { key: "group-b--rr", kind: "round-robin", label: "Group B" },
          ],
          matches: [
            {
              key: "a",
              roundIndex: 0,
              section: "group-a--rr",
              a: { type: "seed", seed: 1 },
              b: { type: "seed", seed: 2 },
            },
            {
              key: "b",
              roundIndex: 1,
              section: "group-b--rr",
              a: { type: "seed", seed: 3 },
              b: { type: "seed", seed: 4 },
            },
          ],
        }) as any;

      function setupGroupedStage() {
        const tournamentId = new Types.ObjectId();
        hostedTournamentRepo.findBySlug.mockResolvedValue(
          buildTournament({ id: tournamentId.toString() }),
        );
        const stage = buildStage({ tournamentId, type: "custom" });
        stageRepo.findBySlug.mockResolvedValue(stage);
        // Answer with whatever was asked for: a team entering two sections is
        // looked up once, so a fixed list would report a phantom missing team.
        teamRepo.findManyByIds.mockImplementation(async (ids: any) =>
          (ids as Types.ObjectId[]).map((id) =>
            buildTeam({ _id: new Types.ObjectId(id.toString()) }),
          ),
        );
        return stage;
      }

      it("shuffles a random group only among its own teams", async () => {
        const stage = setupGroupedStage();

        const result = await service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupedDto(["certified-random", "manual"]),
        );

        // The random group may land in either order, but never crosses into
        // the other group's seeds — that is the whole point of grouping.
        expect(result.seedOrder.slice(0, 2).sort()).toEqual(
          groupTeamIds.slice(0, 2).sort(),
        );
        // The manual group keeps the submitted order verbatim.
        expect(result.seedOrder.slice(2)).toEqual(groupTeamIds.slice(2));
      });

      it("logs one seeding entry per group, tagged with its seed range", async () => {
        const stage = setupGroupedStage();

        await service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupedDto(["certified-random", "manual"]),
        );

        expect(stage.seedingLog).toHaveLength(2);
        expect(stage.seedingLog[0]).toMatchObject({
          method: "certified-random",
          label: "Group A",
          seedFrom: 1,
          seedTo: 2,
        });
        expect(stage.seedingLog[1]).toMatchObject({
          method: "manual",
          label: "Group B",
          seedFrom: 3,
          seedTo: 4,
        });
      });

      it("counts one generation, not one per group", async () => {
        setupGroupedStage();

        const result = await service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupedDto(["certified-random", "manual"]),
        );

        expect(result.seeding?.timesSeeded).toBe(1);
        expect(result.seeding?.method).toBe("mixed");
        expect(result.seeding?.groups).toHaveLength(2);
      });

      it("persists the section metadata", async () => {
        const stage = setupGroupedStage();

        await service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupedDto(["manual", "manual"]),
        );

        expect(stage.sections).toEqual([
          { key: "group-a--rr", kind: "round-robin", label: "Group A" },
          { key: "group-b--rr", kind: "round-robin", label: "Group B" },
        ]);
      });

      it("lets a team enter two groups, giving it a seed in each", async () => {
        const stage = setupGroupedStage();
        const dto = groupedDto(["manual", "manual"]);
        // The same team plays in group A and again in group B.
        dto.seedGroups[1].teamIds[0] = groupTeamIds[0];

        const result = await service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dto,
        );

        // Seeds are positional, so the repeat occupies its own seed number
        // rather than collapsing onto the first one.
        const seedOrder = result.seedOrder;
        expect(seedOrder.length).toBe(
          dto.seedGroups.flatMap((g: any) => g.teamIds).length,
        );
        expect(seedOrder.filter((id) => id === groupTeamIds[0]).length).toBe(2);
        expect(stage.pools.flatMap((p: any) => p.teamIds)).toEqual(seedOrder);
        expect(matchupRepo.createMany).toHaveBeenCalled();
      });

      it("rejects an empty group", async () => {
        setupGroupedStage();
        const dto = groupedDto(["manual", "manual"]);
        dto.seedGroups[1].teamIds = [];

        await expect(
          service.generateBracket(
            "league-1",
            "tournament-1",
            "stage-1",
            "auth0|owner",
            dto,
          ),
        ).rejects.toMatchObject({ code: "STG-004" });
      });
    });

    it("rejects when the stage already has matchups", async () => {
      setupBracketStage();
      (matchupRepo.countByStage as jest.Mock).mockResolvedValue(4);

      await expect(
        service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          bracketDto("certified-random"),
        ),
      ).rejects.toMatchObject({ code: "STG-005" });
      expect(matchupRepo.createMany).not.toHaveBeenCalled();
    });

    it("accepts a round-robin stage", async () => {
      // A group stage is authored as one section of the same structure, so
      // its matchups come through the bracket endpoints like any other.
      const stage = setupBracketStage();
      stage.type = "round-robin";

      await expect(
        service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          bracketDto("manual"),
        ),
      ).resolves.toMatchObject({ message: "Bracket generated." });
    });

    it("rejects invalid wiring with the structural reasons", async () => {
      setupBracketStage();
      const dto = bracketDto("manual");
      dto.matches[3].a = { type: "winner", from: "ghost" };

      await expect(
        service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dto,
        ),
      ).rejects.toMatchObject({ code: "STG-004" });
      expect(matchupRepo.createMany).not.toHaveBeenCalled();
    });

    it("rejects a stage belonging to a different tournament", async () => {
      setupBracketStage();
      stageRepo.findBySlug.mockResolvedValue(
        buildStage({ type: "double-elimination" }),
      );

      await expect(
        service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          bracketDto("manual"),
        ),
      ).rejects.toMatchObject({ code: "STG-001" });
    });

    it("rejects a non-organizer", async () => {
      setupBracketStage();

      await expect(
        service.generateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|stranger",
          bracketDto("certified-random"),
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });
  });

  describe("setPools seeding lock", () => {
    it("rejects pool edits on a certified-random stage that has matchups", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      stageRepo.findBySlug.mockResolvedValue(
        buildStage({
          seedingLog: [
            {
              method: "certified-random",
              seededAt: new Date(),
              seededBy: "auth0|owner",
            },
          ],
        }),
      );
      (matchupRepo.countByStage as jest.Mock).mockResolvedValue(4);

      await expect(
        service.setPools("league-1", "tournament-1", "stage-1", "auth0|owner", {
          pools: [],
        }),
      ).rejects.toMatchObject({ code: "STG-006" });
      expect(stageRepo.setPools).not.toHaveBeenCalled();
    });

    it("still allows pool edits on manually-seeded stages with matchups", async () => {
      hostedTournamentRepo.findBySlug.mockResolvedValue(buildTournament());
      stageRepo.findBySlug.mockResolvedValue(
        buildStage({
          seedingLog: [
            { method: "manual", seededAt: new Date(), seededBy: "auth0|owner" },
          ],
        }),
      );
      (matchupRepo.countByStage as jest.Mock).mockResolvedValue(4);
      stageRepo.setPools.mockResolvedValue(buildStage());

      await service.setPools(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        { pools: [] },
      );
      expect(stageRepo.setPools).toHaveBeenCalled();
    });
  });

  describe("deleteBracket", () => {
    it("clears matchups but never the seeding log", async () => {
      const tournamentId = new Types.ObjectId();
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: tournamentId.toString() }),
      );
      const stage = buildStage({
        tournamentId,
        seedingLog: [
          {
            method: "certified-random",
            seededAt: new Date(),
            seededBy: "auth0|owner",
          },
        ],
      });
      stageRepo.findBySlug.mockResolvedValue(stage);
      (matchupRepo.deleteByStage as jest.Mock).mockResolvedValue(4);

      const result = await service.deleteBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
      );

      expect(matchupRepo.deleteByStage).toHaveBeenCalledWith(stage._id);
      expect(stage.seedingLog).toHaveLength(1);
      expect(result).toEqual({ message: "Deleted 4 matchups." });
    });
  });

  describe("updateBracket", () => {
    const teamIds = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];

    /** A stage mid-season: two rounds, one played matchup, already seeded. */
    function setupRunningStage(
      options: { withResults?: boolean; type?: string } = {},
    ) {
      const tournamentId = new Types.ObjectId();
      hostedTournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ id: tournamentId.toString() }),
      );

      const roundIds = [new Types.ObjectId(), new Types.ObjectId()];
      const stage = buildStage({
        tournamentId,
        type: options.type ?? "double-elimination",
        rounds: [
          { _id: roundIds[0], name: "Week 1" },
          { _id: roundIds[1], name: "Week 2" },
        ],
        pools: [
          {
            poolKey: "bracket",
            name: "Bracket",
            teamIds: teamIds.map((id) => new Types.ObjectId(id)),
          },
        ],
        seedingLog: [
          {
            method: "certified-random",
            seededAt: new Date(),
            seededBy: "auth0|owner",
            seedFrom: 1,
            seedTo: 2,
          },
        ],
        currentRoundIndex: 1,
      });
      // Rounds already carry _ids here, so `set` must not re-mint them.
      stage.set = jest.fn((key: string, value: unknown) => {
        stage[key] = value;
      });
      stageRepo.findBySlug.mockResolvedValue(stage);

      const matchupId = new Types.ObjectId();
      // The stage is under way, so its draw is in force.
      (matchupRepo.countByStage as jest.Mock).mockResolvedValue(1);
      teamRepo.findManyByIds.mockImplementation(async (ids: any) =>
        (ids as Types.ObjectId[]).map((id) =>
          buildTeam({ _id: new Types.ObjectId(id.toString()) }),
        ),
      );
      (matchupRepo.findStructureByStage as jest.Mock).mockResolvedValue([
        {
          _id: matchupId,
          round: roundIds[0],
          section: "winners",
          position: 0,
          side1: {
            slot: { type: "seed", seed: 1 },
            team: new Types.ObjectId(teamIds[0]),
          },
          side2: {
            slot: { type: "seed", seed: 2 },
            team: new Types.ObjectId(teamIds[1]),
          },
          results: options.withResults ? [{ winner: "side1" }] : [],
          winner: options.withResults ? "side1" : undefined,
        },
      ]);

      return { stage, roundIds, matchupId };
    }

    const dtoFor = (
      matchupId: Types.ObjectId,
      roundIds: Types.ObjectId[],
      over: Record<string, unknown> = {},
    ) =>
      ({
        rounds: [
          { _id: roundIds[0].toString(), name: "Week 1" },
          { _id: roundIds[1].toString(), name: "Week 2" },
        ],
        sections: [{ key: "winners", kind: "winners" }],
        matches: [
          {
            _id: matchupId.toString(),
            key: "w1-0",
            roundIndex: 0,
            section: "winners",
            position: 0,
            a: { type: "seed", seed: 1 },
            b: { type: "seed", seed: 2 },
          },
        ],
        ...over,
      }) as any;

    it("adds a round without disturbing a played matchup", async () => {
      const { stage, roundIds, matchupId } = setupRunningStage({
        withResults: true,
      });

      const dto = dtoFor(matchupId, roundIds, {
        rounds: [
          { _id: roundIds[0].toString(), name: "Week 1" },
          { _id: roundIds[1].toString(), name: "Week 2" },
          { name: "Week 3" },
        ],
      });
      await service.updateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        dto,
      );

      // The two existing rounds keep their ids; only the third is new.
      expect(stage.rounds.map((r: any) => r._id.toString())).toEqual([
        roundIds[0].toString(),
        roundIds[1].toString(),
        expect.any(String),
      ]);
      expect(stage.rounds[2].name).toBe("Week 3");

      const diff = (matchupRepo.applyStructureDiff as jest.Mock).mock
        .calls[0][0];
      expect(diff.deletes).toEqual([]);
      expect(diff.creates).toEqual([]);
      // The played matchup is only re-placed — no results field is written.
      expect(diff.updates).toHaveLength(1);
      expect(Object.keys(diff.updates[0].set)).not.toContain("results");
    });

    it("refuses to delete a matchup that already has results", async () => {
      const { roundIds } = setupRunningStage({ withResults: true });

      await expect(
        service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          // The played matchup is simply absent from the payload.
          dtoFor(new Types.ObjectId(), roundIds, {
            matches: [
              {
                key: "new",
                roundIndex: 0,
                section: "winners",
                position: 0,
                a: { type: "seed", seed: 1 },
                b: { type: "seed", seed: 2 },
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "STG-004" });
      expect(matchupRepo.applyStructureDiff).not.toHaveBeenCalled();
    });

    it("removes an unplayed matchup", async () => {
      const { roundIds, matchupId } = setupRunningStage();

      await service.updateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        dtoFor(matchupId, roundIds, {
          matches: [
            {
              key: "new",
              roundIndex: 0,
              section: "winners",
              position: 0,
              a: { type: "seed", seed: 1 },
              b: { type: "seed", seed: 2 },
            },
          ],
        }),
      );

      const diff = (matchupRepo.applyStructureDiff as jest.Mock).mock
        .calls[0][0];
      expect(diff.deletes.map(String)).toEqual([matchupId.toString()]);
      expect(diff.creates).toHaveLength(1);
    });

    it("lets a stage whose matchups were deleted be seeded afresh", async () => {
      // deleteBracket clears matchups but keeps the pool it drew from, so the
      // stage still looks seeded. Rebuilding it is a new draw, not a re-roll
      // of one in force — the seedingLog is what records that it happened.
      const { stage, roundIds, matchupId } = setupRunningStage();
      (matchupRepo.findStructureByStage as jest.Mock).mockResolvedValue([]);
      (matchupRepo.countByStage as jest.Mock).mockResolvedValue(0);

      await expect(
        service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dtoFor(matchupId, roundIds, {
            // A different order than the pool holds — legal now the old
            // bracket is gone.
            seedGroups: [
              { teamIds: [teamIds[1], teamIds[0]], method: "manual" },
            ],
          }),
        ),
      ).resolves.toMatchObject({ seedOrder: [teamIds[1], teamIds[0]] });
      expect(stage.pools[0].teamIds).toEqual([teamIds[1], teamIds[0]]);
    });

    it("refuses a seeding that would re-draw an existing one", async () => {
      const { roundIds, matchupId } = setupRunningStage();

      await expect(
        service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dtoFor(matchupId, roundIds, {
            // Same teams, opposite order — a re-roll of a certified draw.
            seedGroups: [
              { teamIds: [teamIds[1], teamIds[0]], method: "manual" },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "STG-006" });
    });

    it("appends new teams manually, keeping the original draw", async () => {
      const { stage, roundIds, matchupId } = setupRunningStage();
      const added = new Types.ObjectId().toString();
      teamRepo.findManyByIds.mockResolvedValue(
        [...teamIds, added].map((id) =>
          buildTeam({ _id: new Types.ObjectId(id) }),
        ),
      );

      await service.updateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        dtoFor(matchupId, roundIds, {
          seedGroups: [
            { teamIds: [...teamIds, added], method: "certified-random" },
          ],
          // An added team has to enter the bracket somewhere; seed 3 would
          // otherwise fail structure validation.
          matches: [
            {
              _id: matchupId.toString(),
              key: "w1-0",
              roundIndex: 0,
              section: "winners",
              position: 0,
              a: { type: "seed", seed: 1 },
              b: { type: "seed", seed: 2 },
            },
            {
              key: "w2-0",
              roundIndex: 1,
              section: "winners",
              position: 0,
              a: { type: "seed", seed: 3 },
              b: { type: "winner", from: "w1-0" },
            },
          ],
        }),
      );

      expect(stage.pools[0].teamIds.map(String)).toEqual([...teamIds, added]);
      // The appended team is seeded manually even though the group asked for
      // random — a second draw would be a re-roll of the first.
      expect(stage.seedingLog).toHaveLength(2);
      expect(stage.seedingLog[1]).toMatchObject({
        method: "manual",
        seedFrom: 3,
        seedTo: 3,
      });
    });

    it("keeps the stage on the same round after an edit shifts indices", async () => {
      const { stage, roundIds, matchupId } = setupRunningStage();

      await service.updateBracket(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        dtoFor(matchupId, roundIds, {
          rounds: [
            { name: "New Opener" },
            { _id: roundIds[0].toString(), name: "Week 1" },
            { _id: roundIds[1].toString(), name: "Week 2" },
          ],
          matches: [
            {
              _id: matchupId.toString(),
              key: "w1-0",
              roundIndex: 1,
              section: "winners",
              position: 0,
              a: { type: "seed", seed: 1 },
              b: { type: "seed", seed: 2 },
            },
          ],
        }),
      );

      // Was index 1 (Week 2); a round inserted ahead of it makes that index 2.
      expect(stage.currentRoundIndex).toBe(2);
    });

    it("accepts a round-robin stage", async () => {
      const { roundIds, matchupId } = setupRunningStage({
        type: "round-robin",
      });

      await expect(
        service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dtoFor(matchupId, roundIds),
        ),
      ).resolves.toMatchObject({ seedOrder: teamIds });
    });

    describe("pools", () => {
      /** Four teams, two sections, each with its own pool key. */
      function setupTwoGroups() {
        const { stage, roundIds } = setupRunningStage();
        const extra = [
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
        ];
        const all = [...teamIds, ...extra];
        stage.pools = [
          {
            poolKey: "bracket",
            name: "Bracket",
            teamIds: all.map((id) => new Types.ObjectId(id)),
          },
        ];
        (matchupRepo.findStructureByStage as jest.Mock).mockResolvedValue([]);
        return { stage, roundIds, all };
      }

      const groupDto = (roundIds: Types.ObjectId[], seeds: number[][]) =>
        ({
          rounds: [{ _id: roundIds[0].toString(), name: "Week 1" }],
          sections: [
            { key: "a", kind: "round-robin", poolKey: "group-a", title: "A" },
            { key: "b", kind: "round-robin", poolKey: "group-b", title: "B" },
          ],
          matches: [
            {
              key: "a1",
              roundIndex: 0,
              section: "a",
              position: 0,
              a: { type: "seed", seed: seeds[0][0] },
              b: { type: "seed", seed: seeds[0][1] },
            },
            {
              key: "b1",
              roundIndex: 0,
              section: "b",
              position: 0,
              a: { type: "seed", seed: seeds[1][0] },
              b: { type: "seed", seed: seeds[1][1] },
            },
          ],
        }) as any;

      it("splits the seed order into one pool per section pool key", async () => {
        const { stage, roundIds, all } = setupTwoGroups();

        await service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupDto(roundIds, [
            [1, 2],
            [3, 4],
          ]),
        );

        expect(stage.pools.map((p: any) => p.poolKey)).toEqual([
          "group-a",
          "group-b",
        ]);
        expect(stage.pools[0].teamIds).toEqual(all.slice(0, 2));
        expect(stage.pools[1].teamIds).toEqual(all.slice(2));
        // Flattening the pools must reproduce the seed order exactly.
        expect(stage.pools.flatMap((p: any) => p.teamIds)).toEqual(all);
      });

      it("keeps one pool when the derived ranges would interleave", async () => {
        const { stage, roundIds, all } = setupTwoGroups();

        // Group A takes seeds 1 and 3, group B takes 2 and 4 — splitting these
        // into pools would renumber every seed on flatten.
        await service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          groupDto(roundIds, [
            [1, 3],
            [2, 4],
          ]),
        );

        expect(stage.pools).toHaveLength(1);
        expect(stage.pools[0].poolKey).toBe("bracket");
        expect(stage.pools[0].teamIds).toEqual(all);
      });

      it("keeps one pool when no section names a pool", async () => {
        const { stage, roundIds, all } = setupTwoGroups();
        const dto = groupDto(roundIds, [
          [1, 2],
          [3, 4],
        ]);
        dto.sections = dto.sections.map((s: any) => ({
          ...s,
          poolKey: undefined,
        }));

        await service.updateBracket(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          dto,
        );

        expect(stage.pools).toHaveLength(1);
        expect(stage.pools[0].teamIds).toEqual(all);
      });
    });
  });
});
