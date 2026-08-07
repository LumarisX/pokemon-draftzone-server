import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Test } from "@nestjs/testing";
import { Types } from "mongoose";
import { TournamentTradeService } from "./tournament-trade.service";

const TOURNAMENT_ID = new Types.ObjectId();

function buildRound(name: string) {
  return { _id: new Types.ObjectId(), name };
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { name: "Giovanni", auth0Id: "auth0|giovanni" },
    pickLog: [],
    ...overrides,
  } as any;
}

function buildTrade(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    side1: { team: new Types.ObjectId(), pokemon: [], tradePoints: 0 },
    side2: { team: new Types.ObjectId(), pokemon: [], tradePoints: 0 },
    timestamp: new Date(),
    activeRound: 0,
    status: "APPROVED",
    ...overrides,
  } as any;
}

function buildTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: TOURNAMENT_ID.toString(),
    owner: "auth0|owner",
    organizers: [],
    rounds: [buildRound("Week 1"), buildRound("Week 2")],
    currentRoundIndex: 0,
    trades: [],
    tradePointLimit: undefined,
    ...overrides,
  } as any;
}

describe("TournamentTradeService", () => {
  let teamRepo: jest.Mocked<TeamRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let service: TournamentTradeService;

  beforeEach(async () => {
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findByIdOrNull: jest.fn().mockResolvedValue(null),
      findIdsBySlugs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(buildTournament()),
      setTrades: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentTradeService,
        { provide: TeamRepository, useValue: teamRepo },
        { provide: HostedTournamentRepository, useValue: tournamentRepo },
      ],
    }).compile();

    service = moduleRef.get(TournamentTradeService);
  });

  /** A team holding one Pokémon, wired through both repository lookups. */
  function withRoster(pokemonId: string, overrides: Record<string, unknown> = {}) {
    const team = buildTeam({
      pickLog: [{ pokemon: { id: pokemonId }, addons: undefined }],
      ...overrides,
    });
    teamRepo.findByIdOrNull.mockResolvedValue(team);
    teamRepo.findManyByIds.mockResolvedValue([team]);
    return team;
  }

  const tradeDto = (overrides: Record<string, unknown> = {}) =>
    ({
      side1: { team: undefined, pokemon: [], tradePoints: 0 },
      side2: { team: undefined, pokemon: [], tradePoints: 0 },
      roundIndex: 0,
      ...overrides,
    }) as any;

  describe("createTrade", () => {
    it("approves an organizer's trade immediately", async () => {
      const team = withRoster("pikachu");

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "auth0|owner",
        tradeDto({
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: false }],
            tradePoints: 0,
          },
        }),
      );

      expect(result.status).toBe("APPROVED");
      const written = tournamentRepo.setTrades.mock.calls[0][1];
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ status: "APPROVED", activeRound: 0 });
    });

    it("holds a coach's own trade for approval", async () => {
      const team = withRoster("pikachu", {
        coach: { name: "Ash", auth0Id: "auth0|ash" },
      });

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "auth0|ash",
        tradeDto({
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: false }],
            tradePoints: 0,
          },
        }),
      );

      expect(result.status).toBe("PENDING");
    });

    it("rejects a coach filing a trade for someone else's team", async () => {
      const team = withRoster("pikachu");

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "auth0|stranger",
          tradeDto({
            side1: {
              team: team._id.toString(),
              pokemon: [],
              tradePoints: 0,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects a round outside the tournament's axis", async () => {
      // The point of moving trades up: activeRound indexes the tournament's
      // rounds, so the bound is the tournament's, not any stage's.
      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "auth0|owner",
          tradeDto({ roundIndex: 5 }),
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("rejects offering a Pokemon the team does not hold", async () => {
      const team = withRoster("pikachu");

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "auth0|owner",
          tradeDto({
            side1: {
              team: team._id.toString(),
              pokemon: [{ id: "mewtwo", tera: false }],
              tradePoints: 0,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "SPC-001" });
    });

    it("rejects a trade that would exceed the trade point limit", async () => {
      const team = withRoster("pikachu");
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          tradePointLimit: 5,
          trades: [
            buildTrade({
              side1: { team: team._id, pokemon: [], tradePoints: 4 },
            }),
          ],
        }),
      );

      await expect(
        service.createTrade(
          "league-1",
          "tournament-1",
          "auth0|owner",
          tradeDto({
            side1: {
              team: team._id.toString(),
              pokemon: [{ id: "pikachu", tera: false }],
              tradePoints: 2,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("appends rather than replacing the tournament's existing trades", async () => {
      const team = withRoster("pikachu");
      const existing = buildTrade();
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [existing] }),
      );

      await service.createTrade(
        "league-1",
        "tournament-1",
        "auth0|owner",
        tradeDto({
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: false }],
            tradePoints: 0,
          },
        }),
      );

      expect(tournamentRepo.setTrades.mock.calls[0][1]).toHaveLength(2);
    });

    it("records a tera pick as the Tera Captain add-on", async () => {
      const team = withRoster("pikachu");

      await service.createTrade(
        "league-1",
        "tournament-1",
        "auth0|owner",
        tradeDto({
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: true }],
            tradePoints: 0,
          },
        }),
      );

      const written = tournamentRepo.setTrades.mock.calls[0][1][0] as any;
      expect(written.side1.pokemon[0].addons).toEqual(["Tera Captain"]);
    });
  });

  describe("setTradeStatus", () => {
    it("rejects a non-organizer", async () => {
      await expect(
        service.setTradeStatus(
          "league-1",
          "tournament-1",
          new Types.ObjectId().toString(),
          "auth0|stranger",
          { status: "APPROVED" },
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects a trade that is not pending", async () => {
      const trade = buildTrade({ status: "APPROVED" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.setTradeStatus(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "APPROVED" },
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("approves a pending trade whose roster still holds up", async () => {
      const team = withRoster("pikachu");
      const trade = buildTrade({
        status: "PENDING",
        side1: {
          team: team._id,
          pokemon: [{ id: "pikachu" }],
          tradePoints: 0,
        },
        side2: { team: undefined, pokemon: [], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await service.setTradeStatus(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { status: "APPROVED" },
      );

      const written = tournamentRepo.setTrades.mock.calls[0][1][0] as any;
      expect(written.status).toBe("APPROVED");
    });

    it("rejects approving a trade that went stale behind another", async () => {
      // Filed when the team held Pikachu; another approved trade has since
      // sent it away, so the offer can no longer be honoured.
      const team = withRoster("mewtwo");
      const trade = buildTrade({
        status: "PENDING",
        side1: {
          team: team._id,
          pokemon: [{ id: "pikachu" }],
          tradePoints: 0,
        },
        side2: { team: undefined, pokemon: [], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.setTradeStatus(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "APPROVED" },
        ),
      ).rejects.toMatchObject({ code: "SPC-001" });
    });

    it("does not count the trade against its own point limit", async () => {
      const team = withRoster("pikachu");
      const trade = buildTrade({
        status: "PENDING",
        side1: {
          team: team._id,
          pokemon: [{ id: "pikachu" }],
          tradePoints: 5,
        },
        side2: { team: undefined, pokemon: [], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ tradePointLimit: 5, trades: [trade] }),
      );

      await expect(
        service.setTradeStatus(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "APPROVED" },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("getTrades", () => {
    it("buckets each trade into its tournament round", async () => {
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          trades: [
            buildTrade({
              activeRound: 1,
              side1: {
                team: teamA._id,
                pokemon: [{ id: "pikachu" }],
                tradePoints: 2,
              },
              side2: { team: teamB._id, pokemon: [], tradePoints: 0 },
            }),
          ],
        }),
      );
      teamRepo.findManyByIds.mockResolvedValue([teamA, teamB]);

      const result = await service.getTrades("league-1", "tournament-1");

      expect(result.rounds[0].trades).toEqual([]);
      expect(result.rounds[1].trades).toHaveLength(1);
      // Both participants are listed — a team that spent nothing on a trade
      // still took part in it, and the view is a per-team spend table.
      expect(result.tradePoints.byTeam).toEqual([
        { teamId: teamA._id.toString(), teamName: "A", spent: 2 },
        { teamId: teamB._id.toString(), teamName: "B", spent: 0 },
      ]);
    });

    it("drops a trade whose round is outside the axis", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [buildTrade({ activeRound: 9 })] }),
      );

      const result = await service.getTrades("league-1", "tournament-1");

      expect(result.rounds.every((r) => r.trades.length === 0)).toBe(true);
    });

    it("filters to trades involving the given team", async () => {
      const teamA = buildTeam({ teamName: "A" });
      const teamB = buildTeam({ teamName: "B" });
      const teamC = buildTeam({ teamName: "C" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          trades: [
            buildTrade({
              side1: { team: teamA._id, pokemon: [], tradePoints: 0 },
              side2: { team: teamB._id, pokemon: [], tradePoints: 0 },
            }),
            buildTrade({
              side1: { team: teamB._id, pokemon: [], tradePoints: 0 },
              side2: { team: teamC._id, pokemon: [], tradePoints: 0 },
            }),
          ],
        }),
      );
      teamRepo.findManyByIds.mockResolvedValue([teamA, teamB, teamC]);
      // The filter arrives as a slug — the URL's identifier — and is resolved
      // to the ObjectId the trades actually store.
      teamRepo.findIdsBySlugs.mockResolvedValue([teamA._id]);

      const result = await service.getTrades(
        "league-1",
        "tournament-1",
        "team-a-slug",
      );

      expect(teamRepo.findIdsBySlugs).toHaveBeenCalledWith(["team-a-slug"]);
      expect(result.rounds[0].trades).toHaveLength(1);
    });
  });
});
