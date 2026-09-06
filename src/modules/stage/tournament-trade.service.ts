import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { getName } from "@modules/data/domain/pokedex";
import { isCoachedBy } from "@modules/team/team.domain";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { getRosterByRound } from "./domain/roster";
import { TradeLike, tournamentRosterContext } from "./domain/stage-axis";
import { assertTradePointsWithinLimit } from "./domain/trades";
import { MakeTradeDto, UpdateTradeDto } from "./stage.dto";

/**
 * Trades, held by the tournament rather than by a stage.
 *
 * A trade takes effect at a round, and rounds are tournament-wide — a roster
 * change made during the group phase still holds when the playoffs start. That
 * is the whole reason trades moved up: on a stage they could only ever describe
 * that stage's schedule.
 *
 * Consequently nothing here takes a stage. Replaying a team's trades needs its
 * pick log, the tournament's trades and a round index, none of which a stage
 * owns any more.
 */
@Injectable()
export class TournamentTradeService {
  constructor(
    private readonly teamRepo: TeamRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  private isOrganizer(tournament: HostedTournament, sub?: string): boolean {
    if (!sub) return false;
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: HostedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * @param teamSlug Restricts to trades one team is a party to. A slug because
   *   that is what the team's page has in its URL; the trades themselves store
   *   the ObjectId behind it.
   */
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

    const buildSide = (side: TradeLike["side1"]) => {
      const team = teamOf(side);
      return {
        team: team
          ? {
              id: team._id.toString(),
              name: team.teamName,
              coach: team.coach.name,
              logo: team.logo,
            }
          : undefined,
        pokemon: side.pokemon.map((p) => ({
          id: p.id,
          name: getName(p.id),
          tera: p.addons?.includes("Tera Captain") || false,
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
      if (trade.activeRound < 0 || trade.activeRound >= rounds.length) continue;

      if (
        teamSlug &&
        !filterIds.includes(this.sideTeamId(trade.side1) ?? "") &&
        !filterIds.includes(this.sideTeamId(trade.side2) ?? "")
      )
        continue;

      rounds[trade.activeRound].trades.push({
        id: trade._id?.toString(),
        side1: buildSide(trade.side1),
        side2: buildSide(trade.side2),
        activeRound: trade.activeRound,
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

  // ── Write ─────────────────────────────────────────────────────────────────

  async createTrade(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: MakeTradeDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const isOrganizer = this.isOrganizer(tournament, sub);

    for (const [label, side] of [
      ["side1", dto.side1],
      ["side2", dto.side2],
    ] as const) {
      if (side.team && !isValidObjectId(side.team))
        throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
          reason: `Invalid team ID for ${label}`,
        });
    }

    if (dto.roundIndex < 0 || dto.roundIndex >= tournament.rounds.length)
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Round ${dto.roundIndex} is outside this tournament's ${tournament.rounds.length} round(s)`,
      });

    // A coach may only file a trade their own team is a side of.
    if (!isOrganizer) {
      const teamIds = [dto.side1.team, dto.side2.team].filter(
        (id): id is string => Boolean(id),
      );
      if (!teamIds.length) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
      const teams = await this.teamRepo.findManyByIds(teamIds);
      if (!teams.some((team) => isCoachedBy(team, sub)))
        throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
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

    if (side1.team === undefined && side2.team === undefined)
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: "A trade needs at least one team",
      });

    const status = isOrganizer ? "APPROVED" : "PENDING";
    const candidate = {
      side1,
      side2,
      timestamp: new Date(),
      activeRound: dto.roundIndex,
      status,
    };

    if (status === "APPROVED") {
      assertTradePointsWithinLimit({
        trades: tournament.trades,
        limit: tournament.tradePointLimit,
        trade: candidate,
      });
      await this.assertRostersValid(tournament, candidate, dto.roundIndex);
    }

    await this.tournamentRepo.setTrades(tournament.id, [
      ...(tournament.trades as unknown as Record<string, unknown>[]),
      candidate as unknown as Record<string, unknown>,
    ]);

    return {
      message: isOrganizer
        ? "Trade processed successfully."
        : "Trade submitted for approval.",
      status,
    };
  }

  async updateTrade(
    leagueSlug: string,
    tournamentSlug: string,
    tradeId: string,
    sub: string,
    dto: UpdateTradeDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    if (dto.status === undefined && dto.activeRound === undefined)
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: "Nothing to update",
      });

    const trade = tournament.trades.find(
      (t) => t._id?.toString() === tradeId,
    ) as TradeLike | undefined;
    if (!trade) throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, { tradeId });

    if (trade.status !== "PENDING")
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Trade is already ${trade.status}`,
      });

    const activeRound = dto.activeRound ?? trade.activeRound;
    if (activeRound < 0 || activeRound >= tournament.rounds.length)
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Round ${activeRound} is outside this tournament's ${tournament.rounds.length} round(s)`,
      });

    const status = dto.status ?? trade.status;

    if (status === "APPROVED") {
      // Re-checked at approval time: a pending trade can go stale behind other
      // trades approved after it was filed.
      assertTradePointsWithinLimit({
        trades: tournament.trades,
        limit: tournament.tradePointLimit,
        trade,
        exclude: trade,
      });
      await this.assertRostersValid(tournament, trade, activeRound);
    }

    const updated = {
      _id: trade._id,
      side1: trade.side1,
      side2: trade.side2,
      timestamp: trade.timestamp,
      activeRound,
      status,
    };

    await this.tournamentRepo.setTrades(
      tournament.id,
      tournament.trades.map((t) =>
        t._id?.toString() === tradeId
          ? (updated as unknown as Record<string, unknown>)
          : (t as unknown as Record<string, unknown>),
      ),
    );

    return { message: `Trade ${status.toLowerCase()}.`, status, activeRound };
  }

  async withdrawTrade(
    leagueSlug: string,
    tournamentSlug: string,
    tradeId: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    const trade = tournament.trades.find(
      (t) => t._id?.toString() === tradeId,
    ) as TradeLike | undefined;
    if (!trade) throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, { tradeId });

    if (trade.status !== "PENDING")
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Trade is already ${trade.status}`,
      });

    if (!this.isOrganizer(tournament, sub))
      await this.assertTradeParticipant(trade, sub);

    await this.tournamentRepo.setTrades(
      tournament.id,
      tournament.trades
        .filter((t) => t._id?.toString() !== tradeId)
        .map((t) => t as unknown as Record<string, unknown>),
    );

    return { message: "Trade withdrawn." };
  }

  private async assertTradeParticipant(trade: TradeLike, sub: string) {
    const teamIds = [
      this.sideTeamId(trade.side1),
      this.sideTeamId(trade.side2),
    ].filter((id): id is string => Boolean(id));
    if (!teamIds.length) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const teams = await this.teamRepo.findManyByIds(teamIds);
    if (!teams.some((team) => isCoachedBy(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  /**
   * Each side may only offer Pokémon its team actually holds at that round,
   * counting every trade already approved before it.
   */
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
