import { Types } from "mongoose";
import { LeagueMatchupRepository } from "../matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "../team/team.repository";
import { HostedTournamentRepository } from "../tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { getRosterByRound } from "./domain/roster";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
} from "./domain/standings";
import { StageRepository } from "./stage.repository";
import { StageService } from "./stage.service";

jest.mock("./domain/roster", () => ({
  getRosterByRound: jest.fn(),
}));
jest.mock("./domain/standings", () => ({
  calculateDivisionCoachStandings: jest.fn(),
  calculateDivisionPokemonStandings: jest.fn(),
}));

const mockedGetRosterByRound = getRosterByRound as jest.Mock;
const mockedCalculateDivisionCoachStandings = calculateDivisionCoachStandings as jest.Mock;
const mockedCalculateDivisionPokemonStandings = calculateDivisionPokemonStandings as jest.Mock;

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
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(),
    rounds: [],
    pools: [],
    trades: [],
    currentRoundIndex: 0,
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe("StageService", () => {
  let stageRepo: jest.Mocked<StageRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let matchupRepo: jest.Mocked<LeagueMatchupRepository>;
  let hostedTournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let service: StageService;

  beforeEach(() => {
    stageRepo = {
      create: jest.fn(),
      findAllByTournament: jest.fn(),
      setPools: jest.fn(),
      setCurrentRoundIndex: jest.fn(),
      findById: jest.fn(),
      flattenPoolTeamIds: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<StageRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    matchupRepo = {
      findByRoundsInStage: jest.fn().mockResolvedValue([]),
      findByIdInStage: jest.fn(),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    hostedTournamentRepo = {
      findByKey: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    service = new StageService(stageRepo, teamRepo, matchupRepo, hostedTournamentRepo);

    mockedGetRosterByRound.mockReturnValue([]);
    mockedCalculateDivisionCoachStandings.mockResolvedValue({
      coachStandings: [],
      diffMode: "pokemon",
    });
    mockedCalculateDivisionPokemonStandings.mockResolvedValue([]);
  });

  describe("createStage", () => {
    it("creates the stage when sub is the tournament owner", async () => {
      const tournament = buildTournament({ owner: "auth0|owner" });
      hostedTournamentRepo.findByKey.mockResolvedValue(tournament);
      const created = buildStage();
      stageRepo.create.mockResolvedValue(created);

      const result = await service.createStage("league-1", "tournament-1", "auth0|owner", {
        order: 1,
        name: "Regular Season",
        type: "round-robin",
      });

      expect(stageRepo.create).toHaveBeenCalledWith({
        tournamentId: tournament.id,
        order: 1,
        name: "Regular Season",
        type: "round-robin",
        rounds: undefined,
      });
      expect(result).toBe(created);
    });

    it("allows an organizer (not just the owner) to create a stage", async () => {
      const tournament = buildTournament({ owner: "auth0|owner", organizers: ["auth0|deputy"] });
      hostedTournamentRepo.findByKey.mockResolvedValue(tournament);
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
      const tournament = buildTournament({ owner: "auth0|owner", organizers: [] });
      hostedTournamentRepo.findByKey.mockResolvedValue(tournament);

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
      hostedTournamentRepo.findByKey.mockResolvedValue(tournament);
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
        },
      ]);
    });
  });

  describe("setPools", () => {
    it("rejects an invalid team ID inside a pool before touching the repository", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());

      await expect(
        service.setPools("league-1", "tournament-1", "stage-1", "auth0|owner", {
          pools: [{ poolKey: "A", name: "Pool A", teamIds: ["not-an-object-id"] }],
        }),
      ).rejects.toMatchObject({ code: "VAL-002" });
      expect(stageRepo.setPools).not.toHaveBeenCalled();
    });

    it("converts valid team IDs to ObjectIds and forwards to the repository", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const teamId = new Types.ObjectId().toString();
      stageRepo.setPools.mockResolvedValue(buildStage());

      await service.setPools("league-1", "tournament-1", "stage-1", "auth0|owner", {
        pools: [{ poolKey: "A", name: "Pool A", teamIds: [teamId] }],
      });

      expect(stageRepo.setPools).toHaveBeenCalledWith("stage-1", [
        { poolKey: "A", name: "Pool A", teamIds: [new Types.ObjectId(teamId)] },
      ]);
    });

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.setPools("league-1", "tournament-1", "stage-1", "auth0|stranger", {
          pools: [],
        }),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });
  });

  describe("advanceCurrentRound", () => {
    it("forwards to the repository when sub is the organizer", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const updated = buildStage({ currentRoundIndex: 3 });
      stageRepo.setCurrentRoundIndex.mockResolvedValue(updated);

      const result = await service.advanceCurrentRound(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        { currentRoundIndex: 3 },
      );

      expect(stageRepo.setCurrentRoundIndex).toHaveBeenCalledWith("stage-1", 3);
      expect(result).toBe(updated);
    });

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.advanceCurrentRound("league-1", "tournament-1", "stage-1", "auth0|stranger", {
          currentRoundIndex: 1,
        }),
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
      const stage = buildStage({ rounds: [round0, round1], currentRoundIndex: 1 });
      stageRepo.findById.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);

      const result = await service.getSchedule(stage._id.toString());

      expect(result.rounds.map((r: any) => r.name)).toEqual(["Week 1", "Week 2"]);
      expect(result.currentRoundIndex).toBe(1);
    });

    it("restricts to only the current round when roundFilter is 'current'", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const round1 = { _id: new Types.ObjectId(), name: "Week 2" };
      const stage = buildStage({ rounds: [round0, round1], currentRoundIndex: 1 });
      stageRepo.findById.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);

      const result = await service.getSchedule(stage._id.toString(), undefined, "current");

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
      stageRepo.findById.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament());
      matchupRepo.findByRoundsInStage.mockResolvedValue([]);
      const teamId = new Types.ObjectId().toString();

      await service.getSchedule(stage._id.toString(), [teamId, "not-an-object-id", ""]);

      expect(matchupRepo.findByRoundsInStage).toHaveBeenCalledWith(stage._id, [round0._id], {
        teamIds: [new Types.ObjectId(teamId)],
      });
    });

    it("transforms a matchup's score/winner/draft fields for a normal (non-forfeit) result", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const stage = buildStage({ rounds: [round0] });
      stageRepo.findById.mockResolvedValue(stage);
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
            side1: { score: 2, pokemon: new Map([["pikachu", { status: "survived" }]]) },
            side2: { score: 1, pokemon: new Map([["mewtwo", { status: "fainted" }]]) },
          },
        ],
      });
      matchupRepo.findByRoundsInStage.mockResolvedValue([matchup]);
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu", addons: ["Tera Captain"] }]);

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
        team1: { team: { pikachu: { status: "survived" } }, score: 2, winner: true },
        team2: { team: { mewtwo: { status: "fainted" } }, score: 1, winner: false },
      });
    });

    it("substitutes the tournament's forfeit.gameDiff for the winning side's score on a forfeit", async () => {
      const round0 = { _id: new Types.ObjectId(), name: "Week 1" };
      const stage = buildStage({ rounds: [round0] });
      stageRepo.findById.mockResolvedValue(stage);
      hostedTournamentRepo.findById.mockResolvedValue(buildTournament({ forfeit: { gameDiff: 3 } }));
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

  describe("getStandings", () => {
    it("composes stage teams and returns coach + Pokemon standings", async () => {
      const stage = buildStage({ rounds: [{}, {}, {}] });
      stageRepo.findById.mockResolvedValue(stage);
      const tournament = buildTournament();
      hostedTournamentRepo.findById.mockResolvedValue(tournament);
      const matchups = [{ id: "matchup-1" }];
      matchupRepo.findByRoundsInStage.mockResolvedValue(matchups as any);
      mockedCalculateDivisionCoachStandings.mockResolvedValue({
        coachStandings: [{ id: "team-1", wins: 3, losses: 1 }],
        diffMode: "pokemon",
      });
      mockedCalculateDivisionPokemonStandings.mockResolvedValue([{ id: "pikachu" }]);

      const result = await service.getStandings(stage._id.toString());

      expect(mockedCalculateDivisionCoachStandings).toHaveBeenCalledWith(
        matchups,
        expect.objectContaining({ _id: stage._id }),
        tournament,
      );
      expect(mockedCalculateDivisionPokemonStandings).toHaveBeenCalledWith(matchups);
      expect(result).toEqual({
        coachStandings: {
          cutoff: 8,
          weeks: 3,
          teams: [{ id: "team-1", wins: 3, losses: 1 }],
          diffMode: "pokemon",
        },
        pokemonStandings: [{ id: "pikachu" }],
      });
    });
  });

  describe("getTrades", () => {
    function buildTradeFixture(overrides: Record<string, unknown> = {}) {
      return {
        side1: { team: buildTeam({ teamName: "Team A" }), pokemon: [{ id: "pikachu" }] },
        side2: { team: buildTeam({ teamName: "Team B" }), pokemon: [{ id: "mewtwo" }] },
        activeRound: 0,
        timestamp: new Date(),
        status: "APPROVED",
        ...overrides,
      };
    }

    it("buckets each trade into its active round's bucket", async () => {
      const trade = buildTradeFixture({ activeRound: 1 });
      const stage = buildStage({
        rounds: [{ name: "Week 1" }, { name: "Week 2" }],
        trades: [trade],
      });
      stageRepo.findById.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades).toEqual([]);
      expect(result.rounds[1].trades).toHaveLength(1);
      expect(result.rounds[1].trades[0]).toMatchObject({
        activeRound: 1,
        status: "APPROVED",
        side1: { team: { name: "Team A" }, pokemon: [{ id: "pikachu", name: "Pikachu", tera: false }] },
      });
    });

    it("includes trades regardless of status (pending/approved/rejected)", async () => {
      const trade = buildTradeFixture({ status: "PENDING" });
      const stage = buildStage({ rounds: [{ name: "Week 1" }], trades: [trade] });
      stageRepo.findById.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect(result.rounds[0].trades[0]).toMatchObject({ status: "PENDING" });
    });

    it("drops trades whose activeRound is out of bounds for the stage's rounds", async () => {
      const trade = buildTradeFixture({ activeRound: -1 });
      const stage = buildStage({ rounds: [{ name: "Week 1" }], trades: [trade] });
      stageRepo.findById.mockResolvedValue(stage);

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
      const stage = buildStage({ rounds: [{ name: "Week 1" }], trades: [trade] });
      stageRepo.findById.mockResolvedValue(stage);

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
      stageRepo.findById.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString(), teamA._id.toString());

      expect(result.rounds[0].trades).toHaveLength(1);
    });

    it("represents a bye side (no team) with an undefined team field", async () => {
      const trade = buildTradeFixture({ side2: { team: undefined, pokemon: [] } });
      const stage = buildStage({ rounds: [{ name: "Week 1" }], trades: [trade] });
      stageRepo.findById.mockResolvedValue(stage);

      const result = await service.getTrades(stage._id.toString());

      expect((result.rounds[0].trades[0] as any).side2.team).toBeUndefined();
    });
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
      hostedTournamentRepo.findByKey.mockResolvedValue(
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
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      stageRepo.findById.mockResolvedValue(buildStage());

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
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      stageRepo.findById.mockResolvedValue(buildStage());

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
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findById.mockResolvedValue(stage);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        buildTradeDto(),
      );

      expect(stage.save).not.toHaveBeenCalled();
      expect(result).toEqual({ message: "Trade processed successfully." });
    });

    it("throws TEAM.NOT_FOUND when side1's team doesn't exist", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      stageRepo.findById.mockResolvedValue(buildStage());
      teamRepo.findByIdOrNull.mockResolvedValue(null);
      const teamId = new Types.ObjectId().toString();

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "stage-1",
          "auth0|owner",
          buildTradeDto({ side1: { team: teamId, pokemon: [{ id: "pikachu", tera: false }] } }),
        ),
      ).rejects.toMatchObject({ code: "LR-TEAM-001" });
    });

    it("throws SPECIES.NOT_FOUND when a side offers a Pokemon not on that team's current roster", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findById.mockResolvedValue(stage);
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
            side1: { team: team1._id.toString(), pokemon: [{ id: "mewtwo", tera: false }] },
          }),
        ),
      ).rejects.toMatchObject({ code: "SPC-001" });
    });

    it("records an APPROVED trade and saves the stage on a valid request", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const stage = buildStage();
      stageRepo.findById.mockResolvedValue(stage);
      const team1 = buildTeam();
      const team2 = buildTeam();
      teamRepo.findByIdOrNull.mockImplementation((id) =>
        Promise.resolve(id === team1._id ? team1 : team2),
      );
      mockedGetRosterByRound.mockReturnValue([{ id: "pikachu" }, { id: "charizard" }]);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "stage-1",
        "auth0|owner",
        buildTradeDto({
          side1: { team: team1._id.toString(), pokemon: [{ id: "pikachu", tera: true }] },
          side2: { team: team2._id.toString(), pokemon: [{ id: "charizard", tera: false }] },
          roundIndex: 2,
        }),
      );

      expect(stage.trades).toHaveLength(1);
      expect(stage.trades[0]).toMatchObject({
        side1: { team: team1._id, pokemon: [{ id: "pikachu", addons: ["Tera Captain"] }] },
        side2: { team: team2._id, pokemon: [{ id: "charizard", addons: undefined }] },
        activeRound: 2,
        status: "APPROVED",
      });
      expect(stage.save).toHaveBeenCalled();
      expect(result).toEqual({ message: "Trade processed successfully." });
    });
  });

  describe("updateMatchup", () => {
    function buildMatchupDoc(overrides: Record<string, unknown> = {}) {
      return {
        results: [],
        side1: { score: 0 },
        side2: { score: 0 },
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as any;
    }

    it("rejects a non-organizer", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(
        buildTournament({ owner: "auth0|owner", organizers: [] }),
      );

      await expect(
        service.updateMatchup(
          "league-1",
          "tournament-1",
          "stage-1",
          new Types.ObjectId().toString(),
          "auth0|stranger",
          { matches: [] } as any,
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects an invalid matchup id", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());

      await expect(
        service.updateMatchup(
          "league-1",
          "tournament-1",
          "stage-1",
          "not-an-object-id",
          "auth0|owner",
          { matches: [] } as any,
        ),
      ).rejects.toMatchObject({ code: "VAL-002" });
    });

    it("rebuilds results, dropping pokemon entries with a null/undefined status", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const matchup = buildMatchupDoc();
      matchupRepo.findByIdInStage.mockResolvedValue(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        "stage-1",
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
          side1: { score: 2, pokemon: new Map([["pikachu", { status: "survived" }]]) },
          side2: { score: 1, pokemon: new Map([["mewtwo", { status: "fainted" }]]) },
        },
      ]);
      expect(matchup.save).toHaveBeenCalled();
    });

    it("applies dto.score to both sides when given", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const matchup = buildMatchupDoc();
      matchupRepo.findByIdInStage.mockResolvedValue(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        "stage-1",
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
    ])("maps dto.winner %s to matchup {winner, forfeit}", async (dtoWinner, expected) => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      const matchup = buildMatchupDoc();
      matchupRepo.findByIdInStage.mockResolvedValue(matchup);

      await service.updateMatchup(
        "league-1",
        "tournament-1",
        "stage-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        { matches: [], winner: dtoWinner } as any,
      );

      expect(matchup.winner).toBe(expected.winner);
      expect(matchup.forfeit).toBe(expected.forfeit);
    });

    it("returns a confirmation message", async () => {
      hostedTournamentRepo.findByKey.mockResolvedValue(buildTournament());
      matchupRepo.findByIdInStage.mockResolvedValue(buildMatchupDoc());

      const result = await service.updateMatchup(
        "league-1",
        "tournament-1",
        "stage-1",
        new Types.ObjectId().toString(),
        "auth0|owner",
        { matches: [] } as any,
      );

      expect(result).toEqual({ message: "Schedule updated." });
    });
  });
});
