import { TransactionRunner } from "@core/database/transaction-runner";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { LeagueMatchupEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan, can } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { BracketSlotInput } from "./domain/bracket";
import { summarizeSeeding } from "./domain/bracket-view";
import {
  carryConfirmedTeams,
  changedPlayedSeeds,
  ResolvedEntrant,
  seedTeamsOf,
  validateEntrants,
} from "./domain/entrants";
import { resolveSeedGroups } from "./domain/seeding";
import { tradeRoundIndex } from "./domain/stage-axis";
import {
  calculateTeamStandings,
  PopulatedStageMatchup,
} from "./domain/standings";
import { validateTournamentBracket } from "./domain/tournament-bracket";
import { StageRepository } from "./stage.repository";
import { StageDocument, StageSeedingEntity, StageType } from "./stage.schema";
import {
  ConfirmStageSeedsDto,
  TournamentBracketStageDto,
  UpdateTournamentBracketDto,
} from "./tournament-bracket.dto";

interface ResolvedStage {
  _id: Types.ObjectId;
  dto: TournamentBracketStageDto;
  existing?: StageDocument;
  order: number;
  seedTeams: (string | null)[];
  entrants: ResolvedEntrant[] | null;
  newSeedingLog: StageSeedingEntity[];
}

interface StructureMatchup {
  _id: Types.ObjectId;
  stage?: Types.ObjectId | null;
  side1?: { slot?: { type?: string; seed?: number } | null } | null;
  side2?: { slot?: { type?: string; seed?: number } | null } | null;
  results?: unknown[];
}

function playedSeedsByStage(
  matchups: StructureMatchup[],
): Map<string, Set<number>> {
  const played = new Map<string, Set<number>>();
  for (const matchup of matchups) {
    if (!matchup.stage || (matchup.results?.length ?? 0) === 0) continue;
    const key = matchup.stage.toString();
    const seeds = played.get(key) ?? new Set<number>();
    for (const side of [matchup.side1, matchup.side2]) {
      if (side?.slot?.type === "seed" && side.slot.seed) seeds.add(side.slot.seed);
    }
    played.set(key, seeds);
  }
  return played;
}

function toStoredEntrants(entrants: ResolvedEntrant[]) {
  return entrants.map((entrant) => ({
    kind: entrant.kind,
    ...(entrant.team ? { team: new Types.ObjectId(entrant.team) } : {}),
    ...(entrant.sourceStage
      ? { sourceStage: new Types.ObjectId(entrant.sourceStage) }
      : {}),
    ...(entrant.place ? { place: entrant.place } : {}),
  }));
}

function denseTeamIds(seedTeams: (string | null)[]): Types.ObjectId[] {
  return seedTeams
    .filter((id): id is string => !!id)
    .map((id) => new Types.ObjectId(id));
}

function isDecided(matchup: {
  winner?: unknown;
  advances?: unknown;
  forfeit?: unknown;
  results?: unknown[];
}): boolean {
  return (
    !!matchup.winner ||
    !!matchup.advances ||
    !!matchup.forfeit ||
    (matchup.results?.length ?? 0) > 0
  );
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

    const seedTeamsByStage = new Map(
      stages.map((stage) => [stage._id.toString(), seedTeamsOf(stage)]),
    );
    const allTeamIds = [
      ...new Set(
        [...seedTeamsByStage.values()]
          .flat()
          .filter((id): id is string => !!id),
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

    const sourceIds = new Set(
      stages.flatMap((stage) =>
        (stage.entrants ?? [])
          .filter((entrant) => entrant.kind === "place" && entrant.sourceStage)
          .map((entrant) => entrant.sourceStage!.toString()),
      ),
    );
    const projections = await Promise.all(
      stages
        .filter((stage) => sourceIds.has(stage._id.toString()))
        .map((stage) =>
          this.projectStandings(
            stage,
            seedTeamsByStage.get(stage._id.toString()) ?? [],
            matchups as unknown as PopulatedStageMatchup[],
            teamById,
            tournament,
          ),
        ),
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
        teams: (seedTeamsByStage.get(stage._id.toString()) ?? [])
          .map((teamId, index) => {
            const team = teamId ? teamById.get(teamId) : undefined;
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
        entrants: (stage.entrants ?? []).map((entrant, index) => ({
          seed: index + 1,
          kind: entrant.kind,
          teamId: entrant.team?.toString() ?? null,
          sourceStageId: entrant.sourceStage?.toString() ?? null,
          place: entrant.place ?? null,
        })),
      })),
      projections,
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

  private async projectStandings(
    stage: StageDocument,
    seedTeams: (string | null)[],
    matchups: PopulatedStageMatchup[],
    teamById: Map<string, PopulatedTeam>,
    tournament: HostedTournament,
  ) {
    const stageId = stage._id.toString();
    const own = matchups.filter(
      (matchup) => matchup.stage?.toString() === stageId,
    );
    const teams = seedTeams
      .map((id) => (id ? teamById.get(id) : undefined))
      .filter((team): team is PopulatedTeam => !!team);
    const { teamStandings } = await calculateTeamStandings(
      own,
      { teams } as unknown as StageDocument & { teams: PopulatedTeam[] },
      tournament,
    );
    return {
      stageId,
      complete: own.length > 0 && own.every(isDecided),
      standings: teamStandings.map((row) => ({
        teamId: row.id,
        teamSlug: row.teamSlug,
        teamName: row.name,
        coachName: row.coach,
        logo: row.logo,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        points: row.points,
        gameDiff: row.gameDiff,
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
    const existing = (await this.matchupRepo.findStructureByStages(
      existingStages.map((stage) => stage._id),
    )) as unknown as (StructureMatchup & LeagueMatchupEntity)[];

    const stages = await this.resolveStages(
      dto,
      existingStages,
      existing,
      sub,
      tournament.id,
    );

    const structureErrors = validateTournamentBracket(
      dto.stages.map((stage) => ({
        key: stage.key,
        type: stage.type,
        teamCount:
          stages.find((s) => s.dto.key === stage.key)?.seedTeams.length ?? 0,
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

    const sourcedFromRemoved = stages.filter((stage) =>
      (stage.entrants ?? []).some(
        (entrant) =>
          entrant.sourceStage &&
          removedStages.some((removed) =>
            removed._id.equals(entrant.sourceStage!),
          ),
      ),
    );
    if (sourcedFromRemoved.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `Stage(s) ${sourcedFromRemoved.map((s) => s.dto.name).join(", ")} take places from a stage being removed.`,
      });

    const toSlot = (slot: BracketSlotInput) =>
      slot.type === "seed"
        ? { type: "seed" as const, seed: slot.seed }
        : { type: slot.type, matchId: idByKey.get(slot.from)!.toString() };

    const sameSlot = (
      a: { type?: string; seed?: number; matchId?: string } | undefined | null,
      b: { type: string; seed?: number; matchId?: string },
    ): boolean =>
      a?.type === b.type && a?.seed === b.seed && a?.matchId === b.matchId;

    const seedTeam = (stage: ResolvedStage, seed: number) => {
      const id = stage.seedTeams[seed - 1];
      return id ? new Types.ObjectId(id) : null;
    };

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
        if (slot.type === "seed")
          return { slot, team: seedTeam(stage, slot.seed!), fixed: true };
        return {
          slot,
          team: sameSlot(side?.slot, slot) ? (side?.team ?? null) : null,
          fixed: false,
        };
      });

      if (!prior) {
        creates.push({
          _id,
          tournamentId: new Types.ObjectId(tournament.id),
          ...placement,
          side1: { slot: sides[0].slot, team: sides[0].team ?? undefined },
          side2: { slot: sides[1].slot, team: sides[1].team ?? undefined },
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
          ...(sides[0].fixed || sides[0].team
            ? { "side1.team": sides[0].team }
            : {}),
          ...(sides[1].fixed || sides[1].team
            ? { "side2.team": sides[1].team }
            : {}),
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
            teamIds: denseTeamIds(stage.seedTeams),
            entrants: stage.entrants ? toStoredEntrants(stage.entrants) : [],
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
              teamIds: denseTeamIds(stage.seedTeams),
              ...(stage.entrants
                ? { entrants: toStoredEntrants(stage.entrants) }
                : {}),
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
    existingMatchups: StructureMatchup[],
    sub: string,
    tournamentId: string,
  ): Promise<ResolvedStage[]> {
    const existingById = new Map(
      existingStages.map((stage) => [stage._id.toString(), stage]),
    );

    for (const stage of dto.stages) {
      if (stage._id && !existingById.has(stage._id))
        throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId: stage._id });
    }

    const stageIdByKey = new Map(
      dto.stages.map((stage) => [
        stage.key,
        stage._id ? existingById.get(stage._id)!._id : new Types.ObjectId(),
      ]),
    );
    const stageKeys = new Set(stageIdByKey.keys());

    const liveStages = new Set<string>();
    for (const stage of existingStages) {
      if ((await this.matchupRepo.countByStage(stage._id)) > 0)
        liveStages.add(stage._id.toString());
    }
    const playedSeeds = playedSeedsByStage(existingMatchups);

    const resolved: ResolvedStage[] = [];
    for (const [order, stageDto] of dto.stages.entries()) {
      const existing = stageDto._id
        ? existingById.get(stageDto._id)
        : undefined;
      const drawIsLive = existing
        ? liveStages.has(existing._id.toString())
        : false;
      const base = {
        _id: stageIdByKey.get(stageDto.key)!,
        dto: stageDto,
        existing,
        order,
      };

      if (stageDto.entrants) {
        const seedTeams = await this.resolveEntrants(
          stageDto,
          existing,
          stageIdByKey,
          stageKeys,
          tournamentId,
          drawIsLive,
          existing ? playedSeeds.get(existing._id.toString()) : undefined,
        );
        resolved.push({ ...base, ...seedTeams, newSeedingLog: [] });
        continue;
      }

      if (existing?.entrants?.length) {
        resolved.push({
          ...base,
          seedTeams: seedTeamsOf(existing),
          entrants: existing.entrants.map((entrant) => ({
            kind: entrant.kind,
            team: entrant.team?.toString() ?? null,
            sourceStage: entrant.sourceStage?.toString() ?? null,
            place: entrant.place ?? null,
          })),
          newSeedingLog: [],
        });
        continue;
      }

      const { seedOrder, newSeedingLog } = await this.resolveStageSeedOrder(
        stageDto,
        existing,
        sub,
        drawIsLive,
      );
      resolved.push({
        ...base,
        seedTeams: seedOrder,
        entrants: null,
        newSeedingLog,
      });
    }
    return resolved;
  }

  private async resolveEntrants(
    stageDto: TournamentBracketStageDto,
    existing: StageDocument | undefined,
    stageIdByKey: Map<string, Types.ObjectId>,
    stageKeys: ReadonlySet<string>,
    tournamentId: string,
    drawIsLive: boolean,
    playedSeeds: Set<number> | undefined,
  ): Promise<{ seedTeams: (string | null)[]; entrants: ResolvedEntrant[] }> {
    const input = stageDto.entrants ?? [];
    const errors = validateEntrants(
      stageDto.key,
      stageDto.name,
      input,
      stageKeys,
    );
    if (errors.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, { reasons: errors });

    const teamIds = [
      ...new Set(
        input
          .filter((entrant) => entrant.kind === "team")
          .map((entrant) => entrant.teamId!),
      ),
    ];
    await this.assertTournamentTeams(tournamentId, teamIds, stageDto.name);

    const entrants = carryConfirmedTeams(
      input.map((entrant) => ({
        kind: entrant.kind,
        team: entrant.kind === "team" ? entrant.teamId! : null,
        sourceStage:
          entrant.kind === "place"
            ? stageIdByKey.get(entrant.sourceStageKey!)!.toString()
            : null,
        place: entrant.kind === "place" ? entrant.place! : null,
      })),
      existing?.entrants ?? [],
    );
    const seedTeams = entrants.map((entrant) => entrant.team);

    if (existing && !existing.entrants?.length && drawIsLive) {
      const drawn = existing.teamIds.map((id) => id.toString());
      if (!drawn.every((id, index) => seedTeams[index] === id))
        throw new PDZError(ErrorCodes.STAGE.SEEDING_LOCKED, {
          stageId: existing._id.toString(),
        });
    }

    if (existing && playedSeeds?.size) {
      const changed = changedPlayedSeeds(
        seedTeamsOf(existing),
        seedTeams,
        playedSeeds,
      );
      if (changed.length > 0)
        throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
          reason: `Seed(s) ${changed.join(", ")} of ${stageDto.name} already have results, so their teams can't change.`,
        });
    }

    return { seedTeams, entrants };
  }

  private async assertTournamentTeams(
    tournamentId: string,
    teamIds: string[],
    stageName: string,
  ): Promise<void> {
    if (teamIds.length === 0) return;
    for (const teamId of teamIds) {
      if (!isValidObjectId(teamId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: `Invalid team ID "${teamId}" in stage "${stageName}"`,
        });
    }
    const found = await this.teamRepo.countInTournament(tournamentId, teamIds);
    if (found !== teamIds.length)
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
        reason: `A team in ${stageName} is not part of this tournament`,
      });
  }

  private async resolveStageSeedOrder(
    stageDto: TournamentBracketStageDto,
    existing: StageDocument | undefined,
    sub: string,
    drawIsLive: boolean,
  ): Promise<{ seedOrder: string[]; newSeedingLog: StageSeedingEntity[] }> {
    const existingSeedOrder =
      existing && drawIsLive
        ? existing.teamIds.map((id) => id.toString())
        : [];

    if (!stageDto.seedGroups?.length) {
      if (existingSeedOrder.length === 0 && existing)
        return {
          seedOrder: existing.teamIds.map((id) => id.toString()),
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

  async confirmSeeds(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    stageId: string,
    dto: ConfirmStageSeedsDto,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSchedule");

    const stage = await this.stageRepo.findById(stageId);
    if (stage.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageId });
    if (!stage.entrants?.length)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `${stage.name} takes its teams directly, so it has no seeds to confirm.`,
      });

    const previous = seedTeamsOf(stage);
    const next = [...previous];
    for (const { seed, teamId } of dto.seeds) {
      const entrant = stage.entrants[seed - 1];
      if (!entrant)
        throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
          reason: `${stage.name} has no seed ${seed}`,
        });
      if (entrant.kind === "team")
        throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
          reason: `Seed ${seed} of ${stage.name} is already a team`,
        });
      next[seed - 1] = teamId;
    }

    const assigned = next.filter((id): id is string => !!id);
    if (new Set(assigned).size !== assigned.length)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `A team would enter ${stage.name} more than once`,
      });
    await this.assertTournamentTeams(
      tournament.id,
      [...new Set(dto.seeds.map((s) => s.teamId))],
      stage.name,
    );

    const structure = (await this.matchupRepo.findStructureByStages([
      stage._id,
    ])) as unknown as StructureMatchup[];
    const changed = changedPlayedSeeds(
      previous,
      next,
      playedSeedsByStage(structure).get(stage._id.toString()) ?? new Set(),
    );
    if (changed.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: `Seed(s) ${changed.join(", ")} of ${stage.name} already have results, so their teams can't change.`,
      });

    const entrants = toStoredEntrants(
      stage.entrants.map((entrant, index) => ({
        kind: entrant.kind,
        team: next[index],
        sourceStage: entrant.sourceStage?.toString() ?? null,
        place: entrant.place ?? null,
      })),
    );

    const updates = structure.flatMap((matchup) => {
      const set: Record<string, unknown> = {};
      for (const side of ["side1", "side2"] as const) {
        const slot = matchup[side]?.slot;
        if (slot?.type !== "seed" || !slot.seed) continue;
        const team = next[slot.seed - 1];
        set[`${side}.team`] = team ? new Types.ObjectId(team) : null;
      }
      return Object.keys(set).length ? [{ _id: matchup._id, set }] : [];
    });

    await this.transactions.run(async () => {
      await this.stageRepo.applyStageDiff({
        creates: [],
        updates: [
          {
            _id: stage._id,
            set: { entrants, teamIds: denseTeamIds(next) },
          },
        ],
        deletes: [],
      });
      await this.matchupRepo.applyStructureDiff({
        creates: [],
        updates,
        deletes: [],
      });
      await this.advancement.applyToStages([stage._id]);
    });

    return { message: `Seeds confirmed for ${stage.name}.` };
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
}
