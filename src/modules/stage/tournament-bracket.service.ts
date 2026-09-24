import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { LeagueMatchupEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { BracketSlotInput } from "./domain/bracket";
import { summarizeSeeding } from "./domain/bracket-view";
import { resolveSeedGroups } from "./domain/seeding";
import {
  stageTeamIds,
  tradeRoundIndex,
  usesTournamentAxis,
} from "./domain/stage-axis";
import { validateTournamentBracket } from "./domain/tournament-bracket";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageRepository } from "./stage.repository";
import { StageDocument, StageSeedingEntity, StageType } from "./stage.schema";
import {
  TournamentBracketStageDto,
  UpdateTournamentBracketDto,
} from "./tournament-bracket.dto";

interface ResolvedStage {
  _id: Types.ObjectId;
  dto: TournamentBracketStageDto;
  existing?: StageDocument;
  order: number;
  seedOrder: string[];
  newSeedingLog: StageSeedingEntity[];
}

@Injectable()
export class TournamentBracketService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly advancement: BracketAdvancementService,
    private readonly transactions: TransactionRunner,
  ) {}

  async getBracket(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const canSeeHidden = can(tournament, sub, "viewHidden");

    const stages = (
      await this.stageRepo.findAllByTournament(tournament.id)
    ).filter((stage) => stage.public !== false || canSeeHidden);

    const teamIdsByStage = new Map(
      stages.map((stage) => [stage._id.toString(), stageTeamIds(stage)]),
    );
    const allTeamIds = [
      ...new Set(
        [...teamIdsByStage.values()].flat().map((id) => id.toString()),
      ),
    ];
    const teamDocs = allTeamIds.length
      ? await this.teamRepo.findManyByIds(allTeamIds)
      : [];
    const teamById = new Map(
      teamDocs.map((team) => [team._id.toString(), team]),
    );

    const matchups = await this.matchupRepo.findByStages(
      stages.map((stage) => stage._id),
    );

    return {
      rounds: tournament.rounds.map((round) => ({
        _id: round._id.toString(),
        name: round.name,
        matchDeadline: round.matchDeadline ?? null,
        tradeDeadline: round.tradeDeadline ?? null,
      })),
      currentRoundIndex: tournament.currentRoundIndex,
      stages: stages.map((stage) => ({
        _id: stage._id.toString(),
        slug: stage.slug,
        name: stage.name,
        type: stage.type,
        order: stage.order,
        public: stage.public !== false,
        seeding: summarizeSeeding(stage.seedingLog),
        teams: (teamIdsByStage.get(stage._id.toString()) ?? [])
          .map((teamId, index) => {
            const team = teamById.get(teamId.toString());
            if (!team) return null;
            return {
              seed: index + 1,
              teamId: team._id.toString(),
              teamSlug: team.slug,
              teamName: team.teamName,
              coachName: team.primaryCoach.name,
              logo: team.logo,
            };
          })
          .filter((team): team is NonNullable<typeof team> => team !== null),
      })),
      matches: matchups.map((matchup) => ({
        _id: matchup._id.toString(),
        slug: matchup.slug,
        stage: matchup.stage?.toString() ?? null,
        round: matchup.round?.toString() ?? null,
        position: matchup.position ?? null,
        label: matchup.label ?? null,
        a: this.mapSlot(matchup.side1?.slot),
        b: this.mapSlot(matchup.side2?.slot),
        winner:
          matchup.winner === "side1"
            ? 0
            : matchup.winner === "side2"
              ? 1
              : undefined,
        forfeit: matchup.forfeit ?? false,
        advances: matchup.advances ?? null,
        score: this.seriesScore(matchup, tournament.forfeit?.gameDiff ?? 0),
        scheduledDate: matchup.scheduledDate?.toISOString() ?? null,
        replay: matchup.results?.[0]?.replay,
        replays: (matchup.results ?? [])
          .map((result) => result.replay)
          .filter((replay): replay is string => !!replay),
      })),
    };
  }

  private seriesScore(
    matchup: LeagueMatchupEntity,
    forfeitGameDiff: number,
  ): [number, number] {
    if (matchup.forfeit) {
      if (matchup.winner === "side1") return [forfeitGameDiff, 0];
      if (matchup.winner === "side2") return [0, forfeitGameDiff];
      return [0, 0];
    }
    return [matchup.side1?.score ?? 0, matchup.side2?.score ?? 0];
  }

  private mapSlot(
    slot: { type: string; seed?: number; matchId?: string } | undefined,
  ) {
    if (!slot) return null;
    return slot.type === "seed"
      ? { type: slot.type, seed: slot.seed }
      : { type: slot.type, from: slot.matchId };
  }

  async updateBracket(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: UpdateTournamentBracketDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSchedule");

    if (dto.rounds.length === 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "A tournament needs at least one round",
      });

    const existingStages = await this.stageRepo.findAllByTournament(
      tournament.id,
    );
    const stages = await this.resolveStages(dto, existingStages, sub);

    const structureErrors = validateTournamentBracket(
      dto.stages.map((stage) => ({
        key: stage.key,
        type: stage.type,
        teamCount:
          stages.find((s) => s.dto.key === stage.key)?.seedOrder.length ?? 0,
      })),
      dto.matches.map((match) => ({
        key: match.key,
        stageKey: match.stageKey,
        roundIndex: match.roundIndex,
        position: match.position,
        label: match.label,
        a: match.a as BracketSlotInput,
        b: match.b as BracketSlotInput,
      })),
      dto.rounds.length,
    );
    if (structureErrors.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reasons: structureErrors,
      });

    const existingRoundIds = new Set(
      tournament.rounds.map((round) => round._id.toString()),
    );
    const currentRoundId =
      tournament.rounds[tournament.currentRoundIndex]?._id.toString();

    const nextRounds = dto.rounds.map((round) => ({
      _id:
        round._id && existingRoundIds.has(round._id)
          ? new Types.ObjectId(round._id)
          : new Types.ObjectId(),
      name: round.name,
      matchDeadline: round.matchDeadline,
      tradeDeadline: round.tradeDeadline,
    }));

    const keptRoundIds = new Set(nextRounds.map((round) => round._id.toString()));
    const tradedAwayRounds = [
      ...new Set(
        tournament.trades
          .filter((trade) => trade.status !== "REJECTED")
          .map((trade) => tournament.rounds[tradeRoundIndex(trade, tournament.rounds)])
          .filter(
            (round): round is (typeof tournament.rounds)[number] =>
              !!round && !keptRoundIds.has(round._id.toString()),
          ),
      ),
    ];
    if (tradedAwayRounds.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `Round(s) ${tradedAwayRounds.map((round) => round.name).join(", ")} are being removed but trades take effect in them. Move or reject those trades first, or keep the rounds.`,
      });

    const stageByKey = new Map(stages.map((stage) => [stage.dto.key, stage]));
    const keptStageIds = new Set(stages.map((stage) => stage._id.toString()));
    const removedStages = existingStages.filter(
      (stage) => !keptStageIds.has(stage._id.toString()),
    );

    const existing = await this.matchupRepo.findStructureByStages([
      ...existingStages.map((stage) => stage._id),
    ]);
    const existingById = new Map(existing.map((m) => [m._id.toString(), m]));

    const idByKey = new Map(
      dto.matches.map((match) => [
        match.key,
        match._id && existingById.has(match._id)
          ? new Types.ObjectId(match._id)
          : new Types.ObjectId(),
      ]),
    );

    const keptMatchIds = new Set(
      [...idByKey.values()].map((id) => id.toString()),
    );
    const removed = existing.filter((m) => !keptMatchIds.has(m._id.toString()));
    const played = removed.filter((m) => (m.results?.length ?? 0) > 0);
    if (played.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason:
          `${played.length} matchup(s) being removed already have recorded ` +
          "results. Clear the results first, or keep the matchups.",
      });

    const orphaning = removedStages.filter((stage) =>
      dto.matches.some((match) =>
        stageByKey.get(match.stageKey)?._id.equals(stage._id),
      ),
    );
    if (orphaning.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `Stage(s) ${orphaning.map((s) => s.name).join(", ")} are being removed but still hold matches.`,
      });

    const toSlot = (slot: BracketSlotInput) =>
      slot.type === "seed"
        ? { type: "seed" as const, seed: slot.seed }
        : { type: slot.type, matchId: idByKey.get(slot.from)!.toString() };

    const sameSlot = (
      a: { type?: string; seed?: number; matchId?: string } | undefined,
      b: { type: string; seed?: number; matchId?: string },
    ): boolean =>
      a?.type === b.type && a?.seed === b.seed && a?.matchId === b.matchId;

    const creates: (Partial<LeagueMatchupEntity> & { _id: Types.ObjectId })[] =
      [];
    const updates: { _id: Types.ObjectId; set: Record<string, unknown> }[] = [];

    for (const match of dto.matches) {
      const _id = idByKey.get(match.key)!;
      const prior = existingById.get(_id.toString());
      const stage = stageByKey.get(match.stageKey)!;

      const placement = {
        stage: stage._id,
        round: nextRounds[match.roundIndex]._id,
        position: match.position,
        label: match.label,
      };

      const sides = (["a", "b"] as const).map((key, index) => {
        const slot = toSlot(match[key] as BracketSlotInput);
        const side = index === 0 ? prior?.side1 : prior?.side2;
        const team =
          slot.type === "seed"
            ? new Types.ObjectId(stage.seedOrder[slot.seed! - 1])
            : sameSlot(side?.slot, slot)
              ? side?.team
              : undefined;
        return { slot, team };
      });

      if (!prior) {
        creates.push({
          _id,
          tournamentId: new Types.ObjectId(tournament.id),
          ...placement,
          side1: { slot: sides[0].slot, team: sides[0].team },
          side2: { slot: sides[1].slot, team: sides[1].team },
          results: [],
        } as Partial<LeagueMatchupEntity> & { _id: Types.ObjectId });
        continue;
      }

      updates.push({
        _id,
        set: {
          ...placement,
          "side1.slot": sides[0].slot,
          "side2.slot": sides[1].slot,
          ...(sides[0].team ? { "side1.team": sides[0].team } : {}),
          ...(sides[1].team ? { "side2.team": sides[1].team } : {}),
        },
      });
    }

    await this.transactions.run(async () => {
      await this.stageRepo.applyStageDiff({
        creates: stages
          .filter((stage) => !stage.existing)
          .map((stage) => ({
            _id: stage._id,
            tournamentId: new Types.ObjectId(tournament.id),
            order: stage.order,
            name: stage.dto.name,
            type: stage.dto.type as StageType,
            public: stage.dto.public !== false,
            teamIds: stage.seedOrder.map((id) => new Types.ObjectId(id)),
            seedingLog: stage.newSeedingLog,
          })),
        updates: stages
          .filter((stage) => stage.existing)
          .map((stage) => ({
            _id: stage._id,
            set: {
              order: stage.order,
              name: stage.dto.name,
              type: stage.dto.type,
              ...(stage.dto.public === undefined
                ? {}
                : { public: stage.dto.public }),
              teamIds: stage.seedOrder.map((id) => new Types.ObjectId(id)),
              seedingLog: [
                ...(stage.existing!.seedingLog ?? []),
                ...stage.newSeedingLog,
              ],
            },
          })),
        deletes: removedStages.map((stage) => stage._id),
      });

      const followed = nextRounds.findIndex(
        (round) => round._id.toString() === currentRoundId,
      );
      const nextCurrent =
        dto.currentRoundIndex !== undefined
          ? dto.currentRoundIndex
          : followed >= 0
            ? followed
            : Math.min(tournament.currentRoundIndex, nextRounds.length - 1);

      await this.tournamentRepo.setSchedule(tournament.id, {
        rounds: nextRounds,
        stages: stages.map((stage) => stage._id),
        currentRoundIndex: Math.max(
          -1,
          Math.min(nextCurrent, nextRounds.length - 1),
        ),
        tradesVersion: tournament.tradesVersion,
      });

      await this.matchupRepo.applyStructureDiff({
        creates,
        updates,
        deletes: removed.map((m) => m._id),
      });

      await this.advancement.applyToStages(stages.map((stage) => stage._id));
    });

    return {
      message:
        `Bracket updated: ${creates.length} match(es) added, ` +
        `${updates.length} updated, ${removed.length} removed.`,
      stageIds: Object.fromEntries(
        stages.map((stage) => [stage.dto.key, stage._id.toString()]),
      ),
      matchIds: Object.fromEntries(
        [...idByKey].map(([key, id]) => [key, id.toString()]),
      ),
    };
  }

  private async resolveStages(
    dto: UpdateTournamentBracketDto,
    existingStages: StageDocument[],
    sub: string,
  ): Promise<ResolvedStage[]> {
    const existingById = new Map(
      existingStages.map((stage) => [stage._id.toString(), stage]),
    );

    for (const stage of dto.stages) {
      if (stage._id && !existingById.has(stage._id))
        throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId: stage._id });
    }

    const liveMatchupCounts = new Map<string, number>();
    for (const stage of existingStages) {
      liveMatchupCounts.set(
        stage._id.toString(),
        await this.matchupRepo.countByStage(stage._id),
      );
    }

    const resolved: ResolvedStage[] = [];
    for (const [order, stageDto] of dto.stages.entries()) {
      const existing = stageDto._id
        ? existingById.get(stageDto._id)
        : undefined;

      const { seedOrder, newSeedingLog } = await this.resolveStageSeedOrder(
        stageDto,
        existing,
        sub,
        existing
          ? (liveMatchupCounts.get(existing._id.toString()) ?? 0) > 0
          : false,
      );

      resolved.push({
        _id: existing?._id ?? new Types.ObjectId(),
        dto: stageDto,
        existing,
        order,
        seedOrder,
        newSeedingLog,
      });
    }
    return resolved;
  }

  private async resolveStageSeedOrder(
    stageDto: TournamentBracketStageDto,
    existing: StageDocument | undefined,
    sub: string,
    drawIsLive: boolean,
  ): Promise<{ seedOrder: string[]; newSeedingLog: StageSeedingEntity[] }> {
    const existingSeedOrder =
      existing && drawIsLive
        ? stageTeamIds(existing).map((id) => id.toString())
        : [];

    if (!stageDto.seedGroups?.length) {
      if (existingSeedOrder.length === 0 && existing)
        return {
          seedOrder: stageTeamIds(existing).map((id) => id.toString()),
          newSeedingLog: [],
        };
      return { seedOrder: existingSeedOrder, newSeedingLog: [] };
    }

    const requested = stageDto.seedGroups.flatMap((group) => group.teamIds);

    const preservesDraw = existingSeedOrder.every(
      (teamId, index) => requested[index] === teamId,
    );
    if (!preservesDraw)
      throw new PDZError(ErrorCodes.STAGE.SEEDING_LOCKED, {
        stageId: existing?._id.toString(),
      });

    for (const teamId of requested) {
      if (!isValidObjectId(teamId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: `Invalid team ID "${teamId}" in stage "${stageDto.name}"`,
        });
    }
    const uniqueRequested = [...new Set(requested)];
    const teamDocs = await this.teamRepo.findManyByIds(
      uniqueRequested.map((id) => new Types.ObjectId(id)),
    );
    if (teamDocs.length !== uniqueRequested.length) {
      const found = new Set(teamDocs.map((t) => t._id.toString()));
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
        teamId: uniqueRequested.filter((id) => !found.has(id)).join(", "),
      });
    }

    if (existingSeedOrder.length === 0) {
      const { seedOrder, logEntries } = resolveSeedGroups(
        stageDto.seedGroups,
        sub,
      );
      return { seedOrder, newSeedingLog: logEntries };
    }

    const appended = requested.slice(existingSeedOrder.length);
    if (appended.length === 0)
      return { seedOrder: existingSeedOrder, newSeedingLog: [] };

    const { logEntries } = resolveSeedGroups(
      [{ teamIds: appended, method: "manual", label: "Added teams" }],
      sub,
      existingSeedOrder.length,
    );
    return {
      seedOrder: [...existingSeedOrder, ...appended],
      newSeedingLog: logEntries,
    };
  }

  async setCurrentRound(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    currentRoundIndex: number,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSchedule");
    this.assertTournamentAxis(tournament);

    if (
      !Number.isInteger(currentRoundIndex) ||
      currentRoundIndex < -1 ||
      currentRoundIndex >= tournament.rounds.length
    )
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Round ${currentRoundIndex} is outside this tournament's ${tournament.rounds.length} round(s)`,
      });

    await this.tournamentRepo.setSchedule(tournament.id, {
      rounds: tournament.rounds,
      stages: tournament.stages.map((stage) => stage._id),
      currentRoundIndex,
    });

    return {
      message:
        currentRoundIndex < 0
          ? "Tournament reset to before the first round."
          : `Now on ${tournament.rounds[currentRoundIndex].name}.`,
      currentRoundIndex,
    };
  }

  assertTournamentAxis(tournament: HostedTournament) {
    if (!usesTournamentAxis(tournament))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, {
        tournamentId: tournament.id,
      });
  }
}
