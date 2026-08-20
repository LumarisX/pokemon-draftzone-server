import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { LeagueMatchupEntity } from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { BracketSlotInput } from "./domain/bracket";
import { summarizeSeeding } from "./domain/bracket-view";
import { resolveSeedGroups } from "./domain/seeding";
import { stageTeamIds, usesTournamentAxis } from "./domain/stage-axis";
import { validateTournamentBracket } from "./domain/tournament-bracket";
import { BracketAdvancementService } from "./bracket-advancement.service";
import { StageRepository } from "./stage.repository";
import { StageDocument, StageSeedingEntity, StageType } from "./stage.schema";
import {
  TournamentBracketStageDto,
  UpdateTournamentBracketDto,
} from "./tournament-bracket.dto";

/** A payload stage paired with the document it resolved to. */
interface ResolvedStage {
  _id: Types.ObjectId;
  dto: TournamentBracketStageDto;
  /** Absent when this request is creating the stage. */
  existing?: StageDocument;
  order: number;
  seedOrder: string[];
  /** Entries to append to the stage's permanent seeding log, if any. */
  newSeedingLog: StageSeedingEntity[];
}

/**
 * The bracket of a whole tournament: its round axis, its stages, and every
 * match, read and written as one unit.
 *
 * This replaces the per-stage bracket endpoints. Rounds belong to the
 * tournament, so a stage cannot own the list — editing it from one stage would
 * renumber every other stage's rounds and orphan their matchups. The builder
 * already holds all three together, so the endpoint matches what it edits.
 */
@Injectable()
export class TournamentBracketService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly advancement: BracketAdvancementService,
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

  async getBracket(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const canSeeHidden = this.isOrganizer(tournament, sub);

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
        bestOf: round.bestOf ?? null,
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
        // Seed N is teams[N - 1]; the order is the seeding.
        teams: (teamIdsByStage.get(stage._id.toString()) ?? [])
          .map((teamId, index) => {
            const team = teamById.get(teamId.toString());
            if (!team) return null;
            return {
              seed: index + 1,
              teamId: team._id.toString(),
              teamSlug: team.slug,
              teamName: team.teamName,
              coachName: team.coach.name,
              logo: team.logo,
            };
          })
          .filter((team): team is NonNullable<typeof team> => team !== null),
      })),
      matches: matchups.map((matchup) => ({
        // `_id` stays: a slot names its upstream match by it.
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
        // The organizer's override for who leaves this match. Only ever set
        // where the result could not answer that — a double forfeit.
        advances: matchup.advances ?? null,
        // Same convention as the schedule view: a forfeit shows the
        // tournament's configured game difference rather than the recorded
        // score, so the two views never disagree about a forfeit.
        score: this.seriesScore(matchup, tournament.forfeit?.gameDiff ?? 0),
        scheduledDate: matchup.scheduledDate?.toISOString() ?? null,
        // Game 1's replay, kept for callers that predate the list below.
        replay: matchup.results?.[0]?.replay,
        replays: (matchup.results ?? [])
          .map((result) => result.replay)
          .filter((replay): replay is string => !!replay),
      })),
    };
  }

  /** Games won by each side, as `[side1, side2]`. */
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

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Applies an edited bracket to a tournament that may already be under way.
   *
   * A diff, not a rebuild: rounds, stages and matchups the payload still lists
   * keep their ids, so recorded results and any team already advanced into a
   * slot survive the edit. Three things are refused rather than done quietly —
   * deleting a matchup that has results, deleting a stage that still holds
   * matchups, and re-drawing a seeding that has already happened.
   */
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
    this.assertOrganizer(tournament, sub);

    if (dto.rounds.length === 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "A tournament needs at least one round",
      });

    const existingStages = await this.stageRepo.findAllByTournament(
      tournament.id,
    );
    const stages = await this.resolveStages(dto, existingStages, sub);

    // ── Structure ───────────────────────────────────────────────────────────
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

    // ── Rounds ──────────────────────────────────────────────────────────────
    // The array's order is the round index, so it is rebuilt in payload order.
    // A round the payload still carries keeps its `_id`: matchups point at
    // these subdocuments, and a fresh id would orphan every one of them.
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
      bestOf: round.bestOf,
    }));

    // ── Matches ─────────────────────────────────────────────────────────────
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

    // A stage is only gone once nothing points at it. Deleting one whose
    // matchups the payload still lists would leave them orphaned.
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
        // A seed always names its team outright, from its own stage's order. A
        // winner/loser slot only has one once the upstream match is decided —
        // keep whatever was already resolved, unless the slot now points
        // somewhere else.
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
          ...placement,
          side1: { slot: sides[0].slot, team: sides[0].team },
          side2: { slot: sides[1].slot, team: sides[1].team },
          results: [],
        } as Partial<LeagueMatchupEntity> & { _id: Types.ObjectId });
        continue;
      }

      // Dotted paths so scores, results and notes on the surviving sides are
      // left exactly as they are.
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

    // ── Commit ──────────────────────────────────────────────────────────────
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
            // Only when the payload actually carries it. Visibility belongs to
            // the organizer's show/hide control, and a bracket save that
            // omitted the field used to read as "make it visible" — silently
            // republishing a stage that had been hidden.
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

    // Follow the round the tournament was on rather than its old index, which
    // the edit may have shifted.
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
    });

    await this.matchupRepo.applyStructureDiff({
      creates,
      updates,
      deletes: removed.map((m) => m._id),
    });

    // A re-pointed slot may hang off a match that was decided long ago, so
    // replay every settled result into whatever now consumes it. Not scoped to
    // one stage: a playoff slot is fed by a match in the stage before it.
    await this.advancement.applyToStages(stages.map((stage) => stage._id));

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

  /**
   * Pairs each payload stage with its stored document and works out its seed
   * order, without writing anything.
   *
   * Seeding is the integrity-sensitive step and is resolved before any other
   * decision, so a refused draw refuses the whole request rather than leaving
   * a half-applied bracket behind.
   */
  private async resolveStages(
    dto: UpdateTournamentBracketDto,
    existingStages: StageDocument[],
    sub: string,
  ): Promise<ResolvedStage[]> {
    const existingById = new Map(
      existingStages.map((stage) => [stage._id.toString(), stage]),
    );

    // Validated up front: a bad id would otherwise be read as "create a new
    // stage", silently abandoning the one the organizer meant to edit.
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

  /**
   * Seed order for one stage of an edited bracket.
   *
   * A stage that has never been seeded is seeded now. A stage that has been
   * seeded keeps its draw: the payload may only confirm the existing order and
   * append to it, and appended teams are always manual — drawing them randomly
   * would be a second roll of the same dice.
   */
  private async resolveStageSeedOrder(
    stageDto: TournamentBracketStageDto,
    existing: StageDocument | undefined,
    sub: string,
    drawIsLive: boolean,
  ): Promise<{ seedOrder: string[]; newSeedingLog: StageSeedingEntity[] }> {
    // Only a live draw is protected: with no matchups left, the stage's team
    // list is a leftover of a deleted bracket rather than a seeding in force.
    const existingSeedOrder =
      existing && drawIsLive
        ? stageTeamIds(existing).map((id) => id.toString())
        : [];

    if (!stageDto.seedGroups?.length) {
      if (existingSeedOrder.length === 0 && existing)
        // Keep whatever the stage already had rather than emptying it: a
        // payload that simply doesn't mention seeding is not a request to
        // remove every team.
        return {
          seedOrder: stageTeamIds(existing).map((id) => id.toString()),
          newSeedingLog: [],
        };
      return { seedOrder: existingSeedOrder, newSeedingLog: [] };
    }

    const requested = stageDto.seedGroups.flatMap((group) => group.teamIds);

    // Checked before anything touches the database: an attempt to re-draw a
    // seeding is refused on its own terms, whether or not the teams resolve.
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
    // A team may enter several stages, so the same id can appear more than
    // once across the payload — each appearance is a separate positional seed.
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

  /**
   * Moves the tournament to a different round.
   *
   * Separate from the bracket PATCH so advancing a week does not require
   * resending every stage and match — and because it is the one schedule edit
   * an organizer makes routinely, mid-season, with results already recorded.
   */
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
    this.assertOrganizer(tournament, sub);
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

  /**
   * Guard for callers that must not run against an unmigrated tournament.
   *
   * NOT_FOUND rather than a distinct code: from the client's side the
   * tournament-level schedule genuinely does not exist yet, and the per-stage
   * routes are still the ones to use.
   */
  assertTournamentAxis(tournament: HostedTournament) {
    if (!usesTournamentAxis(tournament))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, {
        tournamentId: tournament.id,
      });
  }
}
