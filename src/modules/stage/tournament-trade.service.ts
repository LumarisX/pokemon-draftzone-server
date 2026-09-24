import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { getName } from "@modules/data/domain/pokedex";
import { isCoachedBy } from "@modules/team/team.domain";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { getRosterByRound } from "./domain/roster";
import {
  TradeLike,
  tournamentRosterContext,
  tradeRoundIndex,
} from "./domain/stage-axis";
import { assertTradePointsWithinLimit } from "./domain/trades";
import { MakeTradeDto, UpdateTradeDto } from "./stage.dto";

const TRADE_WRITE_ATTEMPTS = 3;

@Injectable()
export class TournamentTradeService {
  constructor(
    private readonly teamRepo: TeamRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
  ) {}

  async getTrades(
    leagueSlug: string,
    tournamentSlug: string,
    teamSlug?: string | string[],
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    const filterIds = (
      await this.teamRepo.findIdsBySlugs(
        tournament.id,
        (Array.isArray(teamSlug) ? teamSlug : [teamSlug]).filter(
          (slug): slug is string => Boolean(slug),
        ),
      )
    ).map((id) => id.toString());

    const rounds: { name: string; trades: unknown[] }[] = tournament.rounds.map(
      (round) => ({ name: round.name, trades: [] }),
    );

    const teamById = await this.loadTradeTeams(tournament.trades);
    const teamOf = (side: TradeLike["side1"]) => {
      const id = this.sideTeamId(side);
      return id ? teamById.get(id) : undefined;
    };

    const tierList = await this.tierListRepo
      .findById(tournament.tierListId)
      .catch(() => undefined);

    const buildSide = (side: TradeLike["side1"]) => {
      const team = teamOf(side);
      return {
        team: team
          ? {
              id: team._id.toString(),
              name: team.teamName,
              coach: team.primaryCoach.name,
              logo: team.logo,
            }
          : undefined,
        pokemon: side.pokemon.map((p) => ({
          id: p.id,
          name: getName(p.id),
          tera: p.addons?.includes("Tera Captain") || false,
          cost: tierList?.getPokemonCost(p.id, p.addons),
          tier: tierList?.getPokemonTier(p.id)?.name,
          ...(tierList && !tierList.hasPokemon(p.id)
            ? { missingFromTierList: true as const }
            : {}),
        })),
        tradePoints: side.tradePoints ?? 0,
      };
    };

    const spentByTeam = new Map<
      string,
      { teamId: string; teamName: string; spent: number }
    >();
    for (const trade of tournament.trades) {
      if (trade.status !== "APPROVED") continue;
      for (const side of [trade.side1, trade.side2]) {
        const team = teamOf(side);
        if (!team) continue;
        const key = team._id.toString();
        const entry = spentByTeam.get(key) ?? {
          teamId: key,
          teamName: team.teamName,
          spent: 0,
        };
        entry.spent += side.tradePoints ?? 0;
        spentByTeam.set(key, entry);
      }
    }

    for (const trade of tournament.trades) {
      const activeRound = tradeRoundIndex(trade, tournament.rounds);
      if (activeRound < 0 || activeRound >= rounds.length) continue;

      if (
        teamSlug &&
        !filterIds.includes(this.sideTeamId(trade.side1) ?? "") &&
        !filterIds.includes(this.sideTeamId(trade.side2) ?? "")
      )
        continue;

      rounds[activeRound].trades.push({
        id: trade._id?.toString(),
        side1: buildSide(trade.side1),
        side2: buildSide(trade.side2),
        activeRound,
        timestamp: trade.timestamp,
        status: trade.status,
      });
    }

    return {
      rounds,
      currentRoundIndex: tournament.currentRoundIndex,
      tradePoints: {
        limit: tournament.tradePointLimit ?? null,
        byTeam: [...spentByTeam.values()].sort((a, b) =>
          a.teamName.localeCompare(b.teamName),
        ),
      },
    };
  }

  async createTrade(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: MakeTradeDto,
  ) {
    for (const [label, side] of [
      ["side1", dto.side1],
      ["side2", dto.side2],
    ] as const) {
      if (side.team && !isValidObjectId(side.team))
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: `Invalid team ID for ${label}`,
        });
    }

    const toSide = (side: MakeTradeDto["side1"]) => ({
      team: side.team ? new Types.ObjectId(side.team) : undefined,
      pokemon: side.pokemon.map((p) => ({
        id: p.id,
        addons: p.tera ? ["Tera Captain"] : undefined,
      })),
      tradePoints: side.team ? (side.tradePoints ?? 0) : 0,
    });
    const side1 = toSide(dto.side1);
    const side2 = toSide(dto.side2);

    return this.retryOnTradeConflict(async () => {
      const tournament = await this.tournamentRepo.findBySlug(
        leagueSlug,
        tournamentSlug,
      );
      const isOrganizer = can(tournament, sub, "manageTrades");

      if (dto.roundIndex < 0 || dto.roundIndex >= tournament.rounds.length)
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: `Round ${dto.roundIndex} is outside this tournament's ${tournament.rounds.length} round(s)`,
        });

      const tradeDeadline = tournament.rounds[dto.roundIndex]?.tradeDeadline;
      if (!isOrganizer && tradeDeadline && new Date() > new Date(tradeDeadline))
        throw new PDZError(ErrorCodes.STAGE.TRADE_DEADLINE_PASSED, {
          roundIndex: dto.roundIndex,
          tradeDeadline,
        });

      if (!isOrganizer) {
        const teamIds = [dto.side1.team, dto.side2.team].filter(
          (id): id is string => Boolean(id),
        );
        if (!teamIds.length) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
        const teams = await this.teamRepo.findManyByIds(teamIds);
        if (!teams.some((team) => isCoachedBy(team, sub, "manageRoster")))
          throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
      }

      if (side1.team === undefined && side2.team === undefined)
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: "A trade needs at least one team",
        });

      const sideTeamIds = [
        ...new Set(
          [side1.team, side2.team]
            .filter((id): id is Types.ObjectId => id !== undefined)
            .map((id) => id.toString()),
        ),
      ];
      if (
        (await this.teamRepo.countInTournament(tournament.id, sideTeamIds)) !==
        sideTeamIds.length
      )
        throw new PDZError(ErrorCodes.TEAM.NOT_FOUND);

      const status = isOrganizer ? "APPROVED" : "PENDING";
      const candidate = {
        side1,
        side2,
        timestamp: new Date(),
        activeRoundId: tournament.rounds[dto.roundIndex]._id,
        status,
        submittedBy: sub,
        resolvedBy: isOrganizer ? sub : undefined,
      };

      if (status === "APPROVED") {
        assertTradePointsWithinLimit({
          trades: tournament.trades,
          limit: tournament.tradePointLimit,
          trade: candidate,
        });
        await this.assertRostersValid(tournament, candidate, dto.roundIndex);
      }

      const written = await this.tournamentRepo.pushTrade(
        tournament.id,
        tournament.tradesVersion,
        candidate,
      );
      if (!written) return undefined;

      return {
        message: isOrganizer
          ? "Trade processed successfully."
          : "Trade submitted for approval.",
        status,
      };
    });
  }

  async updateTrade(
    leagueSlug: string,
    tournamentSlug: string,
    tradeId: string,
    sub: string,
    dto: UpdateTradeDto,
  ) {
    return this.retryOnTradeConflict(async () => {
      const tournament = await this.tournamentRepo.findBySlug(
        leagueSlug,
        tournamentSlug,
      );
      assertCan(tournament, sub, "manageTrades");

      if (dto.status === undefined && dto.activeRound === undefined)
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: "Nothing to update",
        });

      const trade = this.findPendingTrade(tournament, tradeId);

      const activeRound =
        dto.activeRound ?? tradeRoundIndex(trade, tournament.rounds);
      if (activeRound < 0 || activeRound >= tournament.rounds.length)
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: `Round ${activeRound} is outside this tournament's ${tournament.rounds.length} round(s)`,
        });

      const status = dto.status ?? trade.status;

      if (status === "APPROVED") {
        assertTradePointsWithinLimit({
          trades: tournament.trades,
          limit: tournament.tradePointLimit,
          trade,
          exclude: trade,
        });
        await this.assertRostersValid(tournament, trade, activeRound);
      }

      const written = await this.tournamentRepo.resolvePendingTrade(
        tournament.id,
        tournament.tradesVersion,
        trade._id!,
        {
          status,
          activeRoundId: tournament.rounds[activeRound]._id,
          ...(dto.status ? { resolvedBy: sub } : {}),
        },
      );
      if (!written) return undefined;

      return { message: `Trade ${status.toLowerCase()}.`, status, activeRound };
    });
  }

  async withdrawTrade(
    leagueSlug: string,
    tournamentSlug: string,
    tradeId: string,
    sub: string,
  ) {
    return this.retryOnTradeConflict(async () => {
      const tournament = await this.tournamentRepo.findBySlug(
        leagueSlug,
        tournamentSlug,
      );

      const trade = this.findPendingTrade(tournament, tradeId);

      if (!can(tournament, sub, "manageTrades"))
        await this.assertTradeParticipant(trade, sub);

      const written = await this.tournamentRepo.pullPendingTrade(
        tournament.id,
        tournament.tradesVersion,
        trade._id!,
      );
      if (!written) return undefined;

      return { message: "Trade withdrawn." };
    });
  }

  private async retryOnTradeConflict<T>(
    attempt: () => Promise<T | undefined>,
  ): Promise<T> {
    for (let tries = 0; tries < TRADE_WRITE_ATTEMPTS; tries++) {
      const result = await attempt();
      if (result !== undefined) return result;
    }
    throw new PDZError(ErrorCodes.STAGE.TRADES_CHANGED);
  }

  private findPendingTrade(
    tournament: HostedTournament,
    tradeId: string,
  ): TradeLike {
    const trade = tournament.trades.find(
      (t) => t._id?.toString() === tradeId,
    ) as TradeLike | undefined;
    if (!trade) throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, { tradeId });

    if (trade.status !== "PENDING")
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Trade is already ${trade.status}`,
      });

    return trade;
  }

  private async assertTradeParticipant(trade: TradeLike, sub: string) {
    const teamIds = [
      this.sideTeamId(trade.side1),
      this.sideTeamId(trade.side2),
    ].filter((id): id is string => Boolean(id));
    if (!teamIds.length) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const teams = await this.teamRepo.findManyByIds(teamIds);
    if (!teams.some((team) => isCoachedBy(team, sub, "manageRoster")))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  private async assertRostersValid(
    tournament: HostedTournament,
    trade: { side1: TradeLike["side1"]; side2: TradeLike["side2"] },
    roundIndex: number,
  ) {
    const context = tournamentRosterContext(tournament);

    for (const side of [trade.side1, trade.side2]) {
      const teamId = this.sideTeamId(side);
      if (!teamId) continue;

      const team = await this.teamRepo.findByIdOrNull(teamId);
      if (!team) throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId });

      const rosterIds = new Set(
        getRosterByRound(team, context, roundIndex).map((pokemon) => pokemon.id),
      );
      for (const pokemon of side.pokemon) {
        if (!rosterIds.has(pokemon.id))
          throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
            pokemonId: pokemon.id,
            teamId,
          });
      }
    }
  }

  private sideTeamId(side: TradeLike["side1"]): string | undefined {
    if (!side.team) return undefined;
    return side.team instanceof Types.ObjectId
      ? side.team.toString()
      : side.team._id.toString();
  }

  private async loadTradeTeams(trades: TradeLike[]) {
    const ids = [
      ...new Set(
        trades
          .flatMap((trade) => [
            this.sideTeamId(trade.side1),
            this.sideTeamId(trade.side2),
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const teams = ids.length ? await this.teamRepo.findManyByIds(ids) : [];
    return new Map(teams.map((team) => [team._id.toString(), team]));
  }
}
