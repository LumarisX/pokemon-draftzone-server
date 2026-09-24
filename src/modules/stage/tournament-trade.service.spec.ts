import { TeamRepository } from "@modules/team/team.repository";
import { tierId } from "../tier-list/tier-list.test-ids";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Test } from "@nestjs/testing";
import { Types } from "mongoose";
import { TournamentTradeService } from "./tournament-trade.service";

const TOURNAMENT_ID = new Types.ObjectId();

function buildRound(name: string) {
  return { _id: new Types.ObjectId(), name };
}

function buildTeam(overrides: Record<string, unknown> = {}) {
  const team = {
    _id: new Types.ObjectId(),
    teamName: "Team Rocket",
    logo: "logo-key",
    coach: { _id: new Types.ObjectId(), name: "Giovanni", auth0Id: "auth0|giovanni" },
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
    tradesVersion: 0,
    tradePointLimit: undefined,
    ...overrides,
  } as any;
}

describe("TournamentTradeService", () => {
  let teamRepo: jest.Mocked<TeamRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let tierListRepo: jest.Mocked<TierListRepository>;
  let service: TournamentTradeService;

  beforeEach(async () => {
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findByIdOrNull: jest.fn().mockResolvedValue(null),
      findIdsBySlugs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;

    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(buildTournament()),
      pushTrade: jest.fn().mockResolvedValue(true),
      resolvePendingTrade: jest.fn().mockResolvedValue(true),
      pullPendingTrade: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<HostedTournamentRepository>;

    tierListRepo = {
      findById: jest.fn().mockRejectedValue(new Error("no tier list")),
    } as unknown as jest.Mocked<TierListRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentTradeService,
        { provide: TeamRepository, useValue: teamRepo },
        { provide: HostedTournamentRepository, useValue: tournamentRepo },
        { provide: TierListRepository, useValue: tierListRepo },
      ],
    }).compile();

    service = moduleRef.get(TournamentTradeService);
  });

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
    it("approves an organizer's trade immediately, pinned to the round's id", async () => {
      const team = withRoster("pikachu");
      const tournament = buildTournament();
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      const result = await service.createTrade(
        "league-1",
        "tournament-1",
        "auth0|owner",
        tradeDto({
          roundIndex: 1,
          side1: {
            team: team._id.toString(),
            pokemon: [{ id: "pikachu", tera: false }],
            tradePoints: 0,
          },
        }),
      );

      expect(result.status).toBe("APPROVED");
      const written = tournamentRepo.pushTrade.mock.calls[0][2] as any;
      expect(written).toMatchObject({
        status: "APPROVED",
        activeRoundId: tournament.rounds[1]._id,
      });
      expect(written.activeRound).toBeUndefined();
    });

    it("holds a coach's own trade for approval", async () => {
      const team = withRoster("pikachu", {
        coach: { _id: new Types.ObjectId(), name: "Ash", auth0Id: "auth0|ash" },
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
      const written = tournamentRepo.pushTrade.mock.calls[0][2] as any;
      expect(written).toMatchObject({ submittedBy: "auth0|ash" });
      expect(written.resolvedBy).toBeUndefined();
    });

    it("records the organizer as both submitter and resolver", async () => {
      const team = withRoster("pikachu");

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

      expect(tournamentRepo.pushTrade.mock.calls[0][2]).toMatchObject({
        submittedBy: "auth0|owner",
        resolvedBy: "auth0|owner",
      });
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

    it("pushes the new trade at the version it was validated against", async () => {
      const team = withRoster("pikachu");
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [buildTrade()], tradesVersion: 4 }),
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

      expect(tournamentRepo.pushTrade).toHaveBeenCalledWith(
        TOURNAMENT_ID.toString(),
        4,
        expect.objectContaining({ status: "APPROVED" }),
      );
    });

    it("retries against fresh state when the trades changed underneath", async () => {
      const team = withRoster("pikachu");
      tournamentRepo.findBySlug
        .mockResolvedValueOnce(buildTournament({ tradesVersion: 0 }))
        .mockResolvedValueOnce(buildTournament({ tradesVersion: 1 }));
      tournamentRepo.pushTrade
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

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
      expect(tournamentRepo.pushTrade.mock.calls.map((call) => call[1])).toEqual(
        [0, 1],
      );
    });

    it("refuses on retry when a concurrent trade used up the point limit", async () => {
      const team = withRoster("pikachu");
      tournamentRepo.findBySlug
        .mockResolvedValueOnce(buildTournament({ tradePointLimit: 5 }))
        .mockResolvedValueOnce(
          buildTournament({
            tradePointLimit: 5,
            tradesVersion: 1,
            trades: [
              buildTrade({
                side1: { team: team._id, pokemon: [], tradePoints: 4 },
              }),
            ],
          }),
        );
      tournamentRepo.pushTrade.mockResolvedValueOnce(false);

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
      expect(tournamentRepo.pushTrade).toHaveBeenCalledTimes(1);
    });

    it("gives up with STG-009 when every attempt conflicts", async () => {
      const team = withRoster("pikachu");
      tournamentRepo.pushTrade.mockResolvedValue(false);

      await expect(
        service.createTrade(
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
        ),
      ).rejects.toMatchObject({ code: "STG-009" });
      expect(tournamentRepo.pushTrade).toHaveBeenCalledTimes(3);
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

      const written = tournamentRepo.pushTrade.mock.calls[0][2] as any;
      expect(written.side1.pokemon[0].addons).toEqual(["Tera Captain"]);
    });
  });

  describe("updateTrade", () => {
    it("rejects a non-organizer", async () => {
      await expect(
        service.updateTrade(
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
        service.updateTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "APPROVED" },
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("writes a rejection through", async () => {
      const trade = buildTrade({ status: "PENDING" });
      const tournament = buildTournament({ trades: [trade] });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      const result = await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { status: "REJECTED" },
      );

      expect(result).toMatchObject({ status: "REJECTED" });
      const [, version, tradeId, patch] =
        tournamentRepo.resolvePendingTrade.mock.calls[0];
      expect(version).toBe(0);
      expect(tradeId.toString()).toBe(trade._id.toString());
      expect(patch).toEqual({
        status: "REJECTED",
        activeRoundId: tournament.rounds[0]._id,
        resolvedBy: "auth0|owner",
      });
    });

    it("leaves a still-pending trade unresolved when only its round moves", async () => {
      const trade = buildTrade({ status: "PENDING", submittedBy: "auth0|ash" });
      const tournament = buildTournament({ trades: [trade] });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { activeRound: 1 },
      );

      expect(tournamentRepo.resolvePendingTrade.mock.calls[0][3]).toEqual({
        status: "PENDING",
        activeRoundId: tournament.rounds[1]._id,
      });
    });

    it("keeps a pinned trade on its round after a round is inserted ahead of it", async () => {
      const inserted = buildRound("Bye Week");
      const week1 = buildRound("Week 1");
      const week2 = buildRound("Week 2");
      const trade = buildTrade({
        status: "PENDING",
        activeRound: undefined,
        activeRoundId: week1._id,
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ rounds: [inserted, week1, week2], trades: [trade] }),
      );

      const result = await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { status: "REJECTED" },
      );

      expect(result.activeRound).toBe(1);
      expect(tournamentRepo.resolvePendingTrade.mock.calls[0][3]).toMatchObject(
        { activeRoundId: week1._id },
      );
    });

    it("refuses on retry once a concurrent decision resolved the trade", async () => {
      const trade = buildTrade({ status: "PENDING" });
      tournamentRepo.findBySlug
        .mockResolvedValueOnce(buildTournament({ trades: [trade] }))
        .mockResolvedValueOnce(
          buildTournament({
            tradesVersion: 1,
            trades: [{ ...trade, status: "APPROVED" }],
          }),
        );
      tournamentRepo.resolvePendingTrade.mockResolvedValueOnce(false);

      await expect(
        service.updateTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "REJECTED" },
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
      expect(tournamentRepo.resolvePendingTrade).toHaveBeenCalledTimes(1);
    });

    it("moves a pending trade to another round", async () => {
      const trade = buildTrade({ status: "PENDING", activeRound: 0 });
      const tournament = buildTournament({ trades: [trade] });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      const result = await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { activeRound: 1 },
      );

      expect(result).toMatchObject({ activeRound: 1, status: "PENDING" });
      expect(tournamentRepo.resolvePendingTrade.mock.calls[0][3]).toMatchObject(
        { activeRoundId: tournament.rounds[1]._id, status: "PENDING" },
      );
    });

    it("rejects a round outside the tournament's axis", async () => {
      const trade = buildTrade({ status: "PENDING" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.updateTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { activeRound: 7 },
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("rejects an empty edit", async () => {
      const trade = buildTrade({ status: "PENDING" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.updateTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          {},
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("approves at the round it is moved to", async () => {
      const team = withRoster("pikachu");
      const trade = buildTrade({
        status: "PENDING",
        activeRound: 0,
        side1: { team: team._id, pokemon: [{ id: "pikachu" }], tradePoints: 0 },
        side2: { team: undefined, pokemon: [], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      const result = await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { status: "APPROVED", activeRound: 1 },
      );

      expect(result).toMatchObject({ status: "APPROVED", activeRound: 1 });
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

      await service.updateTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
        { status: "APPROVED" },
      );

      expect(tournamentRepo.resolvePendingTrade.mock.calls[0][3].status).toBe(
        "APPROVED",
      );
    });

    it("rejects approving a trade that went stale behind another", async () => {
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
        service.updateTrade(
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
        service.updateTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
          { status: "APPROVED" },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("withdrawTrade", () => {
    it("lets a coach withdraw their own pending trade", async () => {
      const team = withRoster("pikachu", {
        coach: { _id: new Types.ObjectId(), name: "Giovanni", auth0Id: "auth0|giovanni" },
      });
      const trade = buildTrade({
        status: "PENDING",
        side1: { team: team._id, pokemon: [{ id: "pikachu" }], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await service.withdrawTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|giovanni",
      );

      expect(tournamentRepo.pullPendingTrade).toHaveBeenCalledWith(
        TOURNAMENT_ID.toString(),
        0,
        trade._id,
      );
    });

    it("lets an organizer withdraw any pending trade", async () => {
      const trade = buildTrade({ status: "PENDING" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await service.withdrawTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
      );

      expect(tournamentRepo.pullPendingTrade).toHaveBeenCalledTimes(1);
    });

    it("pulls only the withdrawn trade", async () => {
      const trade = buildTrade({ status: "PENDING" });
      const other = buildTrade({ status: "APPROVED" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade, other] }),
      );

      await service.withdrawTrade(
        "league-1",
        "tournament-1",
        trade._id.toString(),
        "auth0|owner",
      );

      expect(tournamentRepo.pullPendingTrade.mock.calls[0][2]).toBe(trade._id);
    });

    it("refuses on retry once a concurrent approval resolved the trade", async () => {
      const trade = buildTrade({ status: "PENDING" });
      tournamentRepo.findBySlug
        .mockResolvedValueOnce(buildTournament({ trades: [trade] }))
        .mockResolvedValueOnce(
          buildTournament({
            tradesVersion: 1,
            trades: [{ ...trade, status: "APPROVED" }],
          }),
        );
      tournamentRepo.pullPendingTrade.mockResolvedValueOnce(false);

      await expect(
        service.withdrawTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
    });

    it("rejects a coach who is not a party to the trade", async () => {
      const team = withRoster("pikachu");
      const trade = buildTrade({
        status: "PENDING",
        side1: { team: team._id, pokemon: [{ id: "pikachu" }], tradePoints: 0 },
      });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.withdrawTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|stranger",
        ),
      ).rejects.toMatchObject({ code: "AUTH-002" });
    });

    it("rejects withdrawing a trade that is already resolved", async () => {
      const trade = buildTrade({ status: "APPROVED" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [trade] }),
      );

      await expect(
        service.withdrawTrade(
          "league-1",
          "tournament-1",
          trade._id.toString(),
          "auth0|owner",
        ),
      ).rejects.toMatchObject({ code: "STG-002" });
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
      expect(result.tradePoints.byTeam).toEqual([
        { teamId: teamA._id.toString(), teamName: "A", spent: 2 },
        { teamId: teamB._id.toString(), teamName: "B", spent: 0 },
      ]);
    });

    it("tags each traded pick with its tier and cost", async () => {
      const team = buildTeam({ teamName: "A" });
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          trades: [
            buildTrade({
              side1: {
                team: team._id,
                pokemon: [{ id: "pikachu" }],
                tradePoints: 0,
              },
              side2: { team: undefined, pokemon: [], tradePoints: 0 },
            }),
          ],
        }),
      );
      teamRepo.findManyByIds.mockResolvedValue([team]);
      tierListRepo.findById.mockResolvedValue({
        pokemon: new Map([["pikachu", { tierId: tierId("B") }]]),
        getPokemonTier: jest.fn().mockReturnValue({ name: "B" }),
        hasPokemon: jest.fn().mockReturnValue(true),
        getPokemonCost: jest.fn().mockReturnValue(12),
      } as any);

      const result = await service.getTrades("league-1", "tournament-1");

      expect((result.rounds[0].trades[0] as any).side1.pokemon[0]).toMatchObject(
        { id: "pikachu", tier: "B", cost: 12 },
      );
    });

    it("drops a trade whose round is outside the axis", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({ trades: [buildTrade({ activeRound: 9 })] }),
      );

      const result = await service.getTrades("league-1", "tournament-1");

      expect(result.rounds.every((r) => r.trades.length === 0)).toBe(true);
    });

    it("buckets a pinned trade by its round id, not its stored index", async () => {
      const week1 = buildRound("Week 1");
      const week2 = buildRound("Week 2");
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          rounds: [week1, week2],
          trades: [buildTrade({ activeRound: 0, activeRoundId: week2._id })],
        }),
      );

      const result = await service.getTrades("league-1", "tournament-1");

      expect(result.rounds[0].trades).toHaveLength(0);
      expect(result.rounds[1].trades).toEqual([
        expect.objectContaining({ activeRound: 1 }),
      ]);
    });

    it("drops a trade whose round id no longer exists", async () => {
      tournamentRepo.findBySlug.mockResolvedValue(
        buildTournament({
          trades: [buildTrade({ activeRoundId: new Types.ObjectId() })],
        }),
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
