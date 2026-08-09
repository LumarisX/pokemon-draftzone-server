import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { ID } from "@pkmn/data";
import {
  ExternalMatchup,
  MatchupSide,
} from "@modules/matchup/sub-modules/external-matchup/external-matchup.domain";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import {
  LeagueMatchupDocument,
  LeagueMatchupEntity,
  MatchResultEntity,
  PokemonResultStatsEntity,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { isCoachedBy } from "@modules/team/team.domain";
import { PopulatedTeam, TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { getName } from "@modules/data/domain/pokedex";
import { BracketMatchInput, validateBracketStructure } from "./domain/bracket";
import { resolveSeedGroups } from "./domain/seeding";
import { assertTradePointsWithinLimit } from "./domain/trades";
import { buildBracketView, summarizeSeeding } from "./domain/bracket-view";
import { MatchupViewer, toMatchupDetail } from "./domain/matchup-view";
import { getRosterByRound } from "./domain/roster";
import { scheduleMatchups } from "./domain/schedule-view";
import {
  currentRoundIndex,
  rosterContext,
  stageRounds,
  stageTeamIds,
  stageTrades,
  TradeLike,
  usesTournamentAxis,
} from "./domain/stage-axis";
import {
  hasResolvedSides,
  PopulatedStageMatchup,
} from "./domain/standings";
import {
  CreateStageDto,
  GenerateBracketDto,
  MakeTradeDto,
  MatchResultDto,
  SetCurrentRoundDto,
  SetStagePoolsDto,
  SetTradeStatusDto,
  SubmitMatchupReportDto,
  UpdateBracketDto,
  UpdateMatchupDto,
  UpdateStageDto,
} from "./stage.dto";
import { StageRepository } from "./stage.repository";
import {
  StageDocument,
  StageTradeEntity,
  StageTradeSideEntity,
} from "./stage.schema";

// Every stage type now authors its matchups through the bracket endpoints:
// the builder treats a round-robin group as one section of the same
// structure, so a stage may hold a group and a knockout side by side. The
// former BRACKET_STAGE_TYPES gate is gone — with all five types allowed it
// could never fire, and StageDocument["type"] is already the closed union.

/**
 * Splits the stage's seed order into one pool per section pool key, so each
 * group gets its own standings table.
 *
 * A pool's teams are whichever seeds its sections actually use, which is why
 * sections that share a pool key (a winners/losers pair, whose losers side
 * enters by reference rather than by seed) end up in one table.
 *
 * The flattened pools must reproduce the seed order exactly — `buildBracketView`
 * numbers seeds by position in that flattened list. So if the derived pools
 * would interleave, this falls back to a single pool rather than quietly
 * renumbering every seed in the bracket.
 */
function derivePools(
  dto: UpdateBracketDto,
  seedOrder: string[],
): { poolKey: string; name: string; teamIds: string[] }[] {
  const single = [
    { poolKey: "bracket", name: "Bracket", teamIds: seedOrder },
  ];
  const sectionByKey = new Map(
    (dto.sections ?? []).map((section) => [section.key, section]),
  );

  // seed number → pool key, via the section the seed enters through.
  const poolBySeed = new Map<number, string>();
  for (const match of dto.matches) {
    const section = sectionByKey.get(match.section ?? "main");
    const poolKey = section?.poolKey;
    if (!poolKey) continue;
    for (const slot of [match.a, match.b]) {
      if (slot.type === "seed" && slot.seed !== undefined)
        poolBySeed.set(slot.seed, poolKey);
    }
  }
  if (poolBySeed.size === 0) return single;

  const order: string[] = [];
  const teamsByPool = new Map<string, string[]>();
  for (let seed = 1; seed <= seedOrder.length; seed++) {
    // A seed no section claims (byes, teams wired in only by reference) stays
    // with whichever pool preceded it, keeping the ranges contiguous.
    const poolKey =
      poolBySeed.get(seed) ?? order[order.length - 1] ?? "bracket";
    if (!teamsByPool.has(poolKey)) {
      order.push(poolKey);
      teamsByPool.set(poolKey, []);
    } else if (order[order.length - 1] !== poolKey) {
      // This pool's seeds are split by another pool's — flattening would
      // reorder them and shift every seed after the break.
      return single;
    }
    teamsByPool.get(poolKey)!.push(seedOrder[seed - 1]);
  }

  const nameOf = (poolKey: string) =>
    (dto.sections ?? []).find((s) => s.poolKey === poolKey)?.title ?? poolKey;

  return order.map((poolKey) => ({
    poolKey,
    name: nameOf(poolKey),
    teamIds: teamsByPool.get(poolKey)!,
  }));
}

@Injectable()
export class StageService {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly teamRepo: TeamRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
  ) {}

  private isOrganizer(tournament: HostedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private assertOrganizer(tournament: HostedTournament, sub: string) {
    if (!this.isOrganizer(tournament, sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  /**
   * Loads a stage, refusing to reveal a hidden one to anyone but an organizer.
   * Throws NOT_FOUND rather than FORBIDDEN so a hidden stage's existence isn't
   * leaked to whoever guessed its id.
   */
  private async findVisibleStage(
    stageSlug: string,
    sub?: string,
  ): Promise<StageDocument> {
    return this.assertStageVisible(
      await this.stageRepo.findBySlug(stageSlug),
      sub,
    );
  }

  /**
   * Split out from `findVisibleStage` for the paths that arrive at a stage
   * through something else — a matchup names its stage, so there is no slug to
   * look up, but the same hidden-stage rule still has to apply.
   */
  private async assertStageVisible(
    stage: StageDocument,
    sub?: string,
  ): Promise<StageDocument> {
    // Only an explicit `false` hides a stage: documents written before this
    // field existed carry no value, and those must stay visible.
    if (stage.public !== false) return stage;
    if (sub) {
      const tournament = await this.hostedTournamentRepo.findById(
        stage.tournamentId,
      );
      if (this.isOrganizer(tournament, sub)) return stage;
    }
    throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug: stage.slug });
  }

  /**
   * Refuses a stage-scoped write to something the tournament now owns.
   *
   * Rounds, the current round and trades all moved up together. Writing them
   * to the stage after that would be worse than an error: the bracket
   * endpoints replace the round list wholesale, so one stage would renumber
   * every other stage's rounds and orphan their matchups, while a trade or a
   * round advance would vanish — the read path prefers the tournament's copy
   * and would never look at what was just written.
   *
   * Every one of these has a tournament-level endpoint as its replacement.
   */
  private assertStageOwnsItsSchedule(
    tournament: HostedTournament,
    stageSlug: string,
  ) {
    if (usesTournamentAxis(tournament))
      throw new PDZError(ErrorCodes.STAGE.SCHEDULE_IS_TOURNAMENT_WIDE, {
        stageSlug,
        tournamentId: tournament.id,
      });
  }

  /**
   * The tournament a stage belongs to, or null if it cannot be loaded.
   *
   * Reads need it for the round axis, which moved off the stage. Null rather
   * than a throw because every caller falls back to the stage's own legacy
   * fields, so a tournament that cannot be read degrades to the old behaviour
   * instead of failing the request.
   */
  private async axisTournament(
    stage: StageDocument,
  ): Promise<HostedTournament | null> {
    return this.hostedTournamentRepo
      .findById(stage.tournamentId.toString())
      .catch(() => null);
  }

  async createStage(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: CreateStageDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    // `dto.rounds` is deliberately not written. Rounds belong to the
    // tournament: a stage created with its own would be invisible to every
    // read (they all prefer the tournament's axis) while still looking like it
    // had a schedule. Rounds are authored through the tournament bracket.
    return this.stageRepo.create({
      tournamentId: tournament.id,
      order: dto.order,
      name: dto.name,
      type: dto.type as StageDocument["type"],
      public: dto.public,
    });
  }

  async setVisibility(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: UpdateStageDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug });

    const stage = await this.stageRepo.setPublic(stageDoc._id, dto.public);
    return { message: stage.public ? "Stage is visible." : "Stage is hidden." };
  }

  /** Lightweight ordered list for the client's stage switcher. */
  async listStages(leagueSlug: string, tournamentSlug: string, sub?: string) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const stages = await this.stageRepo.findAllByTournament(tournament.id);
    const canSeeHidden = sub ? this.isOrganizer(tournament, sub) : false;

    return stages
      .filter((stage) => stage.public !== false || canSeeHidden)
      .map((stage) => ({
        _id: stage._id.toString(),
        slug: stage.slug,
        name: stage.name,
        type: stage.type,
        order: stage.order,
        currentRoundIndex: stage.currentRoundIndex,
        public: stage.public !== false,
      }));
  }

  async setPools(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: SetStagePoolsDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);
    // Pools were superseded by `stage.teamIds`, which every read prefers, so
    // on a migrated tournament this would write somewhere nothing looks again.
    // Teams are set through the tournament bracket's per-stage seed groups.
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    // Once a stage is certified-random and its bracket exists, pool order
    // (= the seeding) is immutable — rewriting it would let an organizer
    // fix a bracket that still displays the certified seal.
    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    const latestSeeding = stageDoc.seedingLog[stageDoc.seedingLog.length - 1];
    if (
      latestSeeding?.method === "certified-random" &&
      (await this.matchupRepo.countByStage(stageDoc._id)) > 0
    ) {
      throw new PDZError(ErrorCodes.STAGE.SEEDING_LOCKED, { stageSlug });
    }

    for (const pool of dto.pools) {
      for (const teamId of pool.teamIds) {
        if (!isValidObjectId(teamId))
          throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
            reason: `Invalid team ID "${teamId}" in pool "${pool.poolKey}"`,
          });
      }
    }

    return this.stageRepo.setPools(
      stageDoc._id,
      dto.pools.map((pool) => ({
        poolKey: pool.poolKey,
        name: pool.name,
        teamIds: pool.teamIds.map((id) => new Types.ObjectId(id)),
      })),
    );
  }

  async advanceCurrentRound(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: SetCurrentRoundDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    return this.stageRepo.setCurrentRoundIndex(
      stageDoc._id,
      dto.currentRoundIndex,
    );
  }

  /** Stage-scoped bracket read; tolerant of a stage with no teams/matchups yet. */
  async getBracket(stageSlug: string, sub?: string) {
    const stageDoc = await this.findVisibleStage(stageSlug, sub);
    const tournament = await this.axisTournament(stageDoc);
    const rounds = stageRounds(stageDoc, tournament ?? undefined);
    // Scoped to the stage as well as the rounds: on a tournament-wide axis the
    // rounds are shared, so matching on round alone would pull in every other
    // stage's matchups.
    const matchups = await this.matchupRepo.findByRoundsInStage(
      stageDoc._id,
      rounds.map((round) => round._id),
    );
    const teamObjIds = stageTeamIds(stageDoc);
    const teamDocs =
      teamObjIds.length > 0
        ? await this.teamRepo.findManyByIds(teamObjIds)
        : [];
    return buildBracketView(stageDoc, matchups, teamDocs, rounds);
  }

  /**
   * Persists a client-wired bracket in one shot: validates the match DAG,
   * assigns teams to seed numbers, writes the stage's rounds/pools/seeding
   * record, and bulk-inserts the matchups.
   *
   * Seed assignment is the integrity-sensitive step and always happens
   * here, never client-side: "certified-random" shuffles server-side with
   * a CSPRNG over the canonicalized participant list, exactly once — the
   * organizer first sees the placements after they exist. "manual" trusts
   * the submitted order but is labeled as organizer-seeded in the bracket
   * view. Every seeding is appended to the stage's permanent seedingLog.
   */
  /**
   * Draws the stage's seed order and records it on the stage's permanent
   * seedingLog. The draw itself lives in `domain/seeding.ts`, shared with the
   * tournament-scoped bracket path so there is only ever one implementation of
   * a certified-random shuffle.
   */
  private resolveSeedGroups(
    stageDoc: StageDocument,
    seedGroups: { teamIds: string[]; method: string; label?: string }[],
    sub: string,
    seedBase = 0,
  ): string[] {
    const { seedOrder, logEntries } = resolveSeedGroups(
      seedGroups,
      sub,
      seedBase,
    );
    stageDoc.seedingLog.push(...logEntries);
    return seedOrder;
  }

  async generateBracket(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: GenerateBracketDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug });
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    if ((await this.matchupRepo.countByStage(stageDoc._id)) > 0)
      throw new PDZError(ErrorCodes.STAGE.MATCHUPS_EXIST, { stageSlug });

    // The flat seedingMethod/teamIds pair is the single-group form of
    // seedGroups; normalize so the rest of this method only sees groups.
    const seedGroups = dto.seedGroups?.length
      ? dto.seedGroups
      : [
          {
            teamIds: dto.teamIds ?? [],
            method: dto.seedingMethod ?? "manual",
            label: undefined as string | undefined,
          },
        ];
    if (seedGroups.some((group) => group.teamIds.length === 0))
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "A seed group must contain at least one team",
      });

    const teamIds = seedGroups.flatMap((group) => group.teamIds);
    if (teamIds.length < 2)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "A bracket needs at least 2 teams",
      });
    // A team may enter several sections — a group stage feeding a playoff
    // bracket puts the same team in both — so the seed order deliberately
    // repeats it. Seeds are positional, so each entry gets its own number.
    for (const teamId of teamIds) {
      if (!isValidObjectId(teamId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: `Invalid team ID "${teamId}"`,
        });
    }
    const uniqueTeamIds = [...new Set(teamIds)];
    const teamDocs = await this.teamRepo.findManyByIds(
      uniqueTeamIds.map((id) => new Types.ObjectId(id)),
    );
    if (teamDocs.length !== uniqueTeamIds.length) {
      const found = new Set(teamDocs.map((t) => t._id.toString()));
      throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
        teamId: uniqueTeamIds.filter((id) => !found.has(id)).join(", "),
      });
    }

    if (dto.rounds.length === 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "Bracket has no rounds",
      });
    const structureErrors = validateBracketStructure(
      dto.matches as BracketMatchInput[],
      teamIds.length,
      dto.rounds.length,
      new Map(
        (dto.sections ?? []).map((section) => [
          section.key,
          section.kind ?? section.key,
        ]),
      ),
    );
    if (structureErrors.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reasons: structureErrors,
      });

    const seedOrder = this.resolveSeedGroups(stageDoc, seedGroups, sub);

    stageDoc.set("rounds", dto.rounds);
    stageDoc.set("sections", dto.sections ?? []);
    stageDoc.set("pools", [
      { poolKey: "bracket", name: "Bracket", teamIds: seedOrder },
    ]);
    await stageDoc.save();

    const idByKey = new Map(
      dto.matches.map((match) => [match.key, new Types.ObjectId()]),
    );
    const toSide = (slot: BracketMatchInput["a"]) =>
      slot.type === "seed"
        ? {
            team: new Types.ObjectId(seedOrder[slot.seed - 1]),
            slot: { type: "seed" as const, seed: slot.seed },
          }
        : {
            slot: {
              type: slot.type,
              matchId: idByKey.get(slot.from)!.toString(),
            },
          };

    await this.matchupRepo.createMany(
      dto.matches.map((match) => ({
        _id: idByKey.get(match.key)!,
        stage: stageDoc._id,
        round: stageDoc.rounds[match.roundIndex]._id,
        section: match.section,
        bracketRound: match.bracketRound,
        position: match.position,
        label: match.label,
        side1: toSide(match.a as BracketMatchInput["a"]),
        side2: toSide(match.b as BracketMatchInput["b"]),
        results: [],
      })),
    );

    return {
      message: "Bracket generated.",
      seeding: summarizeSeeding(stageDoc.seedingLog),
      seedOrder,
      matchIds: Object.fromEntries(
        [...idByKey].map(([key, id]) => [key, id.toString()]),
      ),
    };
  }

  /**
   * Applies an edited bracket to a stage that may already be under way.
   *
   * Unlike `generateBracket`, this is a diff: rounds and matchups the payload
   * still lists are updated in place, keeping their ids, so recorded results
   * and any team already advanced into a slot survive the edit. Two things are
   * therefore refused rather than done quietly — deleting a matchup that has
   * results, and re-drawing a seeding that has already happened.
   */
  async updateBracket(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: UpdateBracketDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug });
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    if (dto.rounds.length === 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason: "Bracket has no rounds",
      });

    // ── Seeding ──────────────────────────────────────────────────────────────
    // A stage whose matchups have all been deleted is being rebuilt from
    // scratch, so its draw is open again — the seedingLog keeps the record of
    // every draw it has had, which is what makes a re-roll honest rather than
    // hidden. Only a stage with live matchups has a draw to protect.
    const liveMatchupCount = await this.matchupRepo.countByStage(stageDoc._id);
    const seedOrder = await this.resolveUpdatedSeedOrder(
      stageDoc,
      dto,
      sub,
      liveMatchupCount > 0,
    );

    // ── Structure validation ─────────────────────────────────────────────────
    const structureErrors = validateBracketStructure(
      dto.matches as BracketMatchInput[],
      seedOrder.length,
      dto.rounds.length,
      new Map(
        (dto.sections ?? []).map((section) => [
          section.key,
          section.kind ?? section.key,
        ]),
      ),
    );
    if (structureErrors.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reasons: structureErrors,
      });

    // ── Rounds ───────────────────────────────────────────────────────────────
    // The array's order is the round index, so it is rebuilt in payload order.
    // A round the payload still carries keeps its `_id`: matchups point at
    // these subdocuments, and a fresh id would orphan every one of them.
    const existingRoundIds = new Set(
      stageDoc.rounds.map((r) => r._id.toString()),
    );
    const currentRoundId =
      stageDoc.rounds[stageDoc.currentRoundIndex]?._id.toString();

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

    // ── Matches ──────────────────────────────────────────────────────────────
    const existing = await this.matchupRepo.findStructureByStage(stageDoc._id);
    const existingById = new Map(existing.map((m) => [m._id.toString(), m]));

    const idByKey = new Map(
      dto.matches.map((match) => [
        match.key,
        match._id && existingById.has(match._id)
          ? new Types.ObjectId(match._id)
          : new Types.ObjectId(),
      ]),
    );

    const keptIds = new Set(
      [...idByKey.values()].map((id) => id.toString()),
    );
    const removed = existing.filter((m) => !keptIds.has(m._id.toString()));
    const played = removed.filter((m) => (m.results?.length ?? 0) > 0);
    if (played.length > 0)
      throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
        reason:
          `${played.length} matchup(s) being removed already have recorded ` +
          "results. Clear the results first, or keep the matchups.",
      });

    const toSlot = (slot: BracketMatchInput["a"]) =>
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
      const round = nextRounds[match.roundIndex]._id;

      const placement = {
        round,
        section: match.section,
        bracketRound: match.bracketRound,
        position: match.position,
        label: match.label,
      };

      const sides = (["a", "b"] as const).map((key, index) => {
        const slot = toSlot(match[key] as BracketMatchInput["a"]);
        const side = index === 0 ? prior?.side1 : prior?.side2;
        // A seed always names its team outright. A winner/loser slot only has
        // one once the upstream match is decided — keep whatever was already
        // resolved, unless the slot now points somewhere else.
        const team =
          slot.type === "seed"
            ? new Types.ObjectId(seedOrder[slot.seed! - 1])
            : sameSlot(side?.slot, slot)
              ? side?.team
              : undefined;
        return { slot, team };
      });

      if (!prior) {
        creates.push({
          _id,
          stage: stageDoc._id,
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

    // ── Commit ───────────────────────────────────────────────────────────────
    stageDoc.set("rounds", nextRounds);
    stageDoc.set("sections", dto.sections ?? []);
    stageDoc.set("pools", derivePools(dto, seedOrder));
    // Follow the round the stage was on rather than its old index, which the
    // edit may have shifted.
    const nextCurrent = nextRounds.findIndex(
      (r) => r._id.toString() === currentRoundId,
    );
    stageDoc.currentRoundIndex =
      nextCurrent >= 0
        ? nextCurrent
        : Math.min(stageDoc.currentRoundIndex, nextRounds.length - 1);
    await stageDoc.save();

    await this.matchupRepo.applyStructureDiff({
      creates,
      updates,
      deletes: removed.map((m) => m._id),
    });

    // A re-pointed slot may hang off a match that was decided long ago, so
    // replay every settled result into whatever now consumes it.
    await this.resolveAllDownstreamSlots(stageDoc._id);

    return {
      message: `Bracket updated: ${creates.length} added, ${updates.length} updated, ${removed.length} removed.`,
      seeding: summarizeSeeding(stageDoc.seedingLog),
      seedOrder,
      matchIds: Object.fromEntries(
        [...idByKey].map(([key, id]) => [key, id.toString()]),
      ),
    };
  }

  /**
   * Seed order for an edited bracket.
   *
   * A stage that has never been seeded is seeded now, exactly as generation
   * would. A stage that has been seeded keeps its draw: the payload may only
   * confirm the existing order and append to it, and appended teams are always
   * manual — drawing them randomly would be a second roll of the same dice.
   */
  private async resolveUpdatedSeedOrder(
    stageDoc: StageDocument,
    dto: UpdateBracketDto,
    sub: string,
    drawIsLive: boolean,
  ): Promise<string[]> {
    // Only a live draw is protected: with no matchups left, the pool is a
    // leftover of a deleted bracket rather than a seeding in force.
    const existingSeedOrder = drawIsLive
      ? stageDoc.pools.flatMap((pool) => pool.teamIds).map((id) => id.toString())
      : [];

    if (!dto.seedGroups?.length) {
      if (existingSeedOrder.length === 0)
        throw new PDZError(ErrorCodes.STAGE.NO_TEAMS_TO_SEED, {
          stageId: stageDoc._id.toString(),
        });
      return existingSeedOrder;
    }

    // A team may enter several sections, so the seed order repeats it — each
    // entry is a separate, positional seed.
    const requested = dto.seedGroups.flatMap((group) => group.teamIds);

    // Checked before anything touches the database: an attempt to re-draw a
    // seeding is refused on its own terms, whether or not the teams resolve.
    const preservesDraw = existingSeedOrder.every(
      (teamId, index) => requested[index] === teamId,
    );
    if (!preservesDraw)
      throw new PDZError(ErrorCodes.STAGE.SEEDING_LOCKED, {
        stageId: stageDoc._id.toString(),
      });

    for (const teamId of requested) {
      if (!isValidObjectId(teamId))
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: `Invalid team ID "${teamId}"`,
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
      if (requested.length < 2)
        throw new PDZError(ErrorCodes.STAGE.INVALID_BRACKET, {
          reason: "A bracket needs at least 2 teams",
        });
      return this.resolveSeedGroups(stageDoc, dto.seedGroups, sub);
    }

    const appended = requested.slice(existingSeedOrder.length);
    if (appended.length === 0) return existingSeedOrder;

    this.resolveSeedGroups(
      stageDoc,
      [{ teamIds: appended, method: "manual", label: "Added teams" }],
      sub,
      existingSeedOrder.length,
    );
    return [...existingSeedOrder, ...appended];
  }

  /**
   * Pushes every decided matchup's winner and loser into the slots that
   * consume them. Cheap enough to run after a structural edit, and the only
   * way a slot re-pointed at an already-played match gets its team.
   */
  private async resolveAllDownstreamSlots(
    stageId: Types.ObjectId,
  ): Promise<void> {
    const matchups = await this.matchupRepo.findStructureByStage(stageId);
    for (const matchup of matchups) {
      if (!matchup.winner || matchup.winner === "draw") continue;
      const winnerSide =
        matchup.winner === "side1" ? matchup.side1 : matchup.side2;
      const loserSide =
        matchup.winner === "side1" ? matchup.side2 : matchup.side1;
      await this.matchupRepo.resolveDownstreamSlots(
        matchup._id,
        winnerSide?.team as Types.ObjectId | undefined,
        loserSide?.team as Types.ObjectId | undefined,
      );
    }
  }

  /**
   * Clears a stage's matchups so a bracket can be regenerated. The
   * seedingLog is intentionally left intact: a certified-random stage that
   * gets torn down and re-randomized will honestly report every seeding
   * it has ever had.
   */
  async deleteBracket(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    if (!stageDoc.tournamentId.equals(tournament.id))
      throw new PDZError(ErrorCodes.STAGE.NOT_FOUND, { stageSlug });

    const deleted = await this.matchupRepo.deleteByStage(stageDoc._id);
    return { message: `Deleted ${deleted} matchups.` };
  }

  /**
   * One schedule view for everyone (no separate "manage" copy). `roundFilter`
   * mirrors the old `stage` query param's `"current"` filter, now scoped to
   * `stage.rounds[stage.currentRoundIndex]` instead of `division.stages`.
   */
  async getSchedule(
    stageSlug: string,
    teamId?: string | string[],
    roundFilter?: string,
    sub?: string,
  ) {
    const stageDoc = await this.findVisibleStage(stageSlug, sub);

    // forfeit.gameDiff is needed to display a forfeited match's score the
    // same way the old division.controller.ts schedule view did — resolved
    // by tournamentId for the same reason as getStandings (Stage is
    // addressed purely by `_id`).
    const tournament = await this.hostedTournamentRepo.findById(
      stageDoc.tournamentId,
    );

    const currentRoundOnly = roundFilter?.toLowerCase() === "current";
    const hasTeamFilter = teamId !== undefined;
    const teamIds = (Array.isArray(teamId) ? teamId : [teamId])
      .filter((id): id is string => Boolean(id))
      .filter((id) => isValidObjectId(id))
      .map((id) => new Types.ObjectId(id));

    const axisRounds = stageRounds(stageDoc, tournament);
    const roster = rosterContext(stageDoc, tournament);
    const current = axisRounds[currentRoundIndex(stageDoc, tournament)];
    const filteredRounds = axisRounds.filter(
      (r) => !currentRoundOnly || (current && r._id.equals(current._id)),
    );

    const allMatchups = (await this.matchupRepo.findByRoundsInStage(
      stageDoc._id,
      filteredRounds.map((r) => r._id),
      hasTeamFilter ? { teamIds } : undefined,
    )) as unknown as PopulatedStageMatchup[];

    const matchupsByRound = new Map<string, PopulatedStageMatchup[]>();
    for (const matchup of allMatchups) {
      const roundKey = matchup.round!.toString();
      const bucket = matchupsByRound.get(roundKey);
      if (bucket) bucket.push(matchup);
      else matchupsByRound.set(roundKey, [matchup]);
    }

    const rounds = filteredRounds.map((roundDoc) => ({
      _id: roundDoc._id,
      name: roundDoc.name,
      matchups: scheduleMatchups(
        matchupsByRound.get(roundDoc._id.toString()) ?? [],
        {
          roster,
          roundIndex: axisRounds.indexOf(roundDoc),
          forfeitGameDiff: tournament.forfeit.gameDiff,
        },
      ),
    }));

    // A team-scoped schedule only shows rounds the team actually plays in.
    // (Safe to drop rounds here: only the unfiltered manage view indexes
    // rounds by currentRoundIndex.)
    const visibleRounds = hasTeamFilter
      ? rounds.filter((round) => round.matchups.length > 0)
      : rounds;

    return {
      rounds: visibleRounds,
      currentRoundIndex: currentRoundIndex(stageDoc, tournament),
    };
  }

  /**
   * Full analysis view (summary/speed/coverage/type/move charts) for one
   * league matchup, shaped like the external matchup breakdown payload so
   * the client's matchup overview page can render either. `sub` only
   * affects side order (a coach sees their own team first).
   */
  async getMatchupAnalysis(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc } = await this.resolveMatchup(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );

    // The tier list decides which alternate formes each pick may run; a missing
    // or unresolvable tier list just means no formes are attached.
    const tierList = await this.tierListRepo
      .findById(tournament.tierListId)
      .catch(() => undefined);

    const axisRounds = stageRounds(stageDoc, tournament);
    const rosterCtx = rosterContext(stageDoc, tournament);
    const roundIndex = matchupDoc.round
      ? axisRounds.findIndex((round) => round._id.equals(matchupDoc.round!))
      : -1;
    const roundDoc = roundIndex === -1 ? undefined : axisRounds[roundIndex];

    const toSide = (side: { team: PopulatedTeam }): MatchupSide => {
      const roster = getRosterByRound(
        side.team,
        rosterCtx,
        roundIndex === -1 ? undefined : roundIndex,
      );
      const team: PDZPokemon[] = [];
      for (const pokemon of roster) {
        try {
          team.push(
            new PDZPokemon(
              {
                id: pokemon.id,
                capt: pokemon.addons?.includes("Tera Captain")
                  ? { tera: [] }
                  : undefined,
                draftFormes: tierList?.getPokemonFormeIds(pokemon.id) as
                  ID[] | undefined,
              },
              tournament.ruleset,
            ),
          );
        } catch {
          // A species that no longer resolves against the ruleset is
          // dropped from the analysis rather than failing the whole page.
        }
      }
      return {
        team,
        teamName: side.team.teamName,
        coach: side.team.coach.name,
        owner: side.team.coach.auth0Id,
      };
    };

    const matchup = new ExternalMatchup({
      ruleset: tournament.ruleset,
      format: tournament.format,
      tournamentName: tournament.name,
      stage: roundDoc?.name ?? stageDoc.name,
      gameTime: matchupDoc.scheduledDate,
      aTeam: toSide(matchupDoc.side1),
      bTeam: toSide(matchupDoc.side2),
    });
    return matchup.analyze(sub);
  }

  /**
   * The matchup a URL names, with the stage and tournament it belongs to.
   *
   * A matchup slug is unique across the collection, so it identifies the match
   * on its own — but that also means the league and tournament in the URL are
   * a claim rather than a fact, and a matchup reached through the wrong
   * tournament has to read as missing rather than as somebody else's match.
   */
  private async resolveMatchup(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const matchupDoc = (await this.matchupRepo.findBySlugPopulated(
      matchupSlug,
    )) as unknown as PopulatedStageMatchup;

    const stageDoc = matchupDoc.stage
      ? await this.stageRepo.findByIdOrNull(matchupDoc.stage)
      : null;
    if (!stageDoc || stageDoc.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });
    await this.assertStageVisible(stageDoc, sub);

    // Bracket matchups with unresolved winner/loser slots have no teams yet —
    // treat them like a missing matchup.
    if (!hasResolvedSides(matchupDoc))
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });

    return { stageDoc, tournament, matchupDoc };
  }

  private async loadMatchupContext(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc } = await this.resolveMatchup(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );

    const isOrganizer = sub ? this.isOrganizer(tournament, sub) : false;
    const side = !sub
      ? null
      : isCoachedBy(matchupDoc.side1.team, sub)
        ? ("side1" as const)
        : isCoachedBy(matchupDoc.side2.team, sub)
          ? ("side2" as const)
          : null;

    const chatEnabled = tournament.matchSettings?.chat !== false;
    const coachReportingEnabled =
      tournament.matchSettings?.coachReporting !== false;

    const viewer: MatchupViewer = {
      side,
      isOrganizer,
      chatEnabled,
      coachReportingEnabled,
      canChat: chatEnabled && (isOrganizer || side !== null),
      canReport: isOrganizer || (coachReportingEnabled && side !== null),
      canReview: isOrganizer,
    };

    return { stageDoc, tournament, matchupDoc, viewer };
  }

  private assertMatchupParticipant(viewer: MatchupViewer) {
    if (!viewer.canChat) throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);
  }

  async getMatchupDetail(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub?: string,
  ) {
    const { stageDoc, tournament, matchupDoc, viewer } =
      await this.loadMatchupContext(
        leagueSlug,
        tournamentSlug,
        matchupSlug,
        sub,
      );

    const axisRounds = stageRounds(stageDoc, tournament);
    const roundIndex = matchupDoc.round
      ? axisRounds.findIndex((round) => round._id.equals(matchupDoc.round!))
      : -1;
    const roundDoc = roundIndex === -1 ? undefined : axisRounds[roundIndex];

    return toMatchupDetail(matchupDoc, {
      roster: rosterContext(stageDoc, tournament),
      roundIndex,
      forfeitGameDiff: tournament.forfeit.gameDiff,
      stage: {
        id: stageDoc._id.toString(),
        slug: stageDoc.slug,
        name: stageDoc.name,
      },
      round: roundDoc
        ? {
            name: roundDoc.name,
            matchDeadline: roundDoc.matchDeadline,
            bestOf: roundDoc.bestOf,
          }
        : null,
      viewer,
    });
  }

  async submitMatchupReport(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    dto: SubmitMatchupReportDto,
  ) {
    const { matchupDoc, viewer } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    if (!viewer.isOrganizer && viewer.side === null)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_PARTICIPANT);
    if (!viewer.isOrganizer && !viewer.coachReportingEnabled)
      throw new PDZError(ErrorCodes.MATCHUP.REPORTING_DISABLED);

    const results = this.buildMatchResults(dto.matches);
    const score = dto.score ?? this.tallyScore(results);
    const winner = dto.winner ?? this.tallyWinner(score);

    if (viewer.isOrganizer) {
      matchupDoc.results = results;
      matchupDoc.side1.score = score.team1;
      matchupDoc.side2.score = score.team2;
      matchupDoc.winner = winner;
      matchupDoc.forfeit = dto.forfeit ?? false;
      matchupDoc.status = "approved";
      matchupDoc.report = undefined;
      await matchupDoc.save();
      await this.advanceBracket(matchupDoc);
      return { message: "Result recorded.", status: "approved" as const };
    }

    const reportingSide =
      viewer.side === "side1" ? matchupDoc.side1 : matchupDoc.side2;
    const reportingTeam = reportingSide.team!;

    matchupDoc.report = {
      team: reportingTeam._id,
      submittedBy: sub,
      submittedByName: reportingTeam.coach.name,
      submittedAt: new Date(),
      results,
      side1Score: score.team1,
      side2Score: score.team2,
      winner,
      forfeit: dto.forfeit || undefined,
      notes: dto.notes?.trim() || undefined,
    };
    matchupDoc.status = "pending";
    await matchupDoc.save();

    return {
      message: "Result submitted for review.",
      status: "pending" as const,
    };
  }

  async reviewMatchupReport(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    approve: boolean,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const { matchupDoc } = await this.loadMatchupContext(
      leagueSlug,
      tournamentSlug,
      matchupSlug,
      sub,
    );
    const report = matchupDoc.report;
    if (!report)
      throw new PDZError(ErrorCodes.MATCHUP.NO_REPORT, { matchupSlug });

    if (!approve) {
      matchupDoc.report = undefined;
      matchupDoc.status = undefined;
      await matchupDoc.save();
      return { message: "Report rejected.", status: "rejected" as const };
    }

    matchupDoc.results = report.results.map((result) => ({
      replay: result.replay,
      winner: result.winner,
      side1: {
        score: result.side1.score,
        pokemon: new Map(result.side1.pokemon),
      },
      side2: {
        score: result.side2.score,
        pokemon: new Map(result.side2.pokemon),
      },
    }));
    matchupDoc.side1.score = report.side1Score ?? 0;
    matchupDoc.side2.score = report.side2Score ?? 0;
    if (report.winner) matchupDoc.winner = report.winner;
    matchupDoc.forfeit = report.forfeit ?? false;
    matchupDoc.status = "approved";
    matchupDoc.report = undefined;
    await matchupDoc.save();
    await this.advanceBracket(matchupDoc);

    return { message: "Report approved.", status: "approved" as const };
  }

  private buildMatchResults(matches: MatchResultDto[]): MatchResultEntity[] {
    return matches.map((match) => ({
      replay: match.link?.trim() || undefined,
      winner: match.winner,
      side1: {
        score: match.team1.score,
        pokemon: new Map(
          Object.entries(match.team1.pokemon).filter(
            ([, stats]) => stats.status !== null && stats.status !== undefined,
          ) as [string, PokemonResultStatsEntity][],
        ),
      },
      side2: {
        score: match.team2.score,
        pokemon: new Map(
          Object.entries(match.team2.pokemon).filter(
            ([, stats]) => stats.status !== null && stats.status !== undefined,
          ) as [string, PokemonResultStatsEntity][],
        ),
      },
    }));
  }

  private tallyScore(results: MatchResultEntity[]) {
    return results.reduce(
      (totals, result) => ({
        team1: totals.team1 + (result.winner === "side1" ? 1 : 0),
        team2: totals.team2 + (result.winner === "side2" ? 1 : 0),
      }),
      { team1: 0, team2: 0 },
    );
  }

  private tallyWinner(score: { team1: number; team2: number }) {
    if (score.team1 > score.team2) return "side1" as const;
    if (score.team2 > score.team1) return "side2" as const;
    return "draw" as const;
  }

  private async advanceBracket(matchup: LeagueMatchupDocument) {
    if (!matchup.winner || !matchup.stage) return;

    const idOf = (
      team?: Types.ObjectId | { _id: Types.ObjectId },
    ): Types.ObjectId | undefined => {
      if (!team) return undefined;
      return team instanceof Types.ObjectId ? team : team._id;
    };

    const side1Id = idOf(matchup.side1.team);
    const side2Id = idOf(matchup.side2.team);
    const winnerTeamId =
      matchup.winner === "side1"
        ? side1Id
        : matchup.winner === "side2"
          ? side2Id
          : undefined;
    const loserTeamId =
      matchup.winner === "side1"
        ? side2Id
        : matchup.winner === "side2"
          ? side1Id
          : undefined;

    if (!winnerTeamId && !loserTeamId) return;
    await this.matchupRepo.resolveDownstreamSlots(
      matchup._id,
      winnerTeamId,
      loserTeamId,
    );
  }

  /** One trades view for everyone (no separate "manage" copy). */
  async getTrades(stageSlug: string, teamId?: string | string[], sub?: string) {
    const stageDoc = await this.findVisibleStage(stageSlug, sub);
    const tournament = await this.axisTournament(stageDoc);
    const trades = stageTrades(stageDoc, tournament ?? undefined);

    const teamIds = (Array.isArray(teamId) ? teamId : [teamId]).filter(
      (id): id is string => Boolean(id) && isValidObjectId(id),
    );

    const rounds: { name: string; trades: unknown[] }[] = stageRounds(
      stageDoc,
      tournament ?? undefined,
    ).map((round) => ({ name: round.name, trades: [] }));

    type TradeSide = TradeLike["side1"];

    // Resolved by lookup rather than Mongoose populate: the trades may be the
    // tournament's, which is a domain object with no document to populate.
    const tradeTeamIds = [
      ...new Set(
        trades.flatMap((trade) =>
          [trade.side1.team, trade.side2.team]
            .filter((team): team is NonNullable<typeof team> => !!team)
            .map((team) =>
              team instanceof Types.ObjectId
                ? team.toString()
                : team._id.toString(),
            ),
        ),
      ),
    ];
    const teamById = new Map(
      (tradeTeamIds.length
        ? await this.teamRepo.findManyByIds(tradeTeamIds)
        : []
      ).map((team) => [team._id.toString(), team]),
    );

    const asPopulatedTeam = (side: TradeSide) => {
      if (!side.team) return undefined;
      const id =
        side.team instanceof Types.ObjectId
          ? side.team.toString()
          : side.team._id.toString();
      return teamById.get(id);
    };

    const buildSide = (side: TradeSide) => {
      const team = asPopulatedTeam(side);
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
    for (const trade of trades) {
      if (trade.status !== "APPROVED") continue;
      for (const side of [trade.side1, trade.side2]) {
        const team = asPopulatedTeam(side);
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

    for (const trade of trades) {
      if (trade.activeRound < 0 || trade.activeRound >= rounds.length) continue;

      if (
        teamId &&
        !teamIds.includes(asPopulatedTeam(trade.side1)?._id.toString() ?? "") &&
        !teamIds.includes(asPopulatedTeam(trade.side2)?._id.toString() ?? "")
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
      currentRoundIndex: currentRoundIndex(stageDoc, tournament ?? undefined),
      tradePoints: {
        limit: tournament?.tradePointLimit ?? null,
        byTeam: [...spentByTeam.values()].sort((a, b) =>
          a.teamName.localeCompare(b.teamName),
        ),
      },
    };
  }

  async createTrade(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    sub: string,
    dto: MakeTradeDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const isOrganizer = this.isOrganizer(tournament, sub);
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);

    if (dto.side1.team && !isValidObjectId(dto.side1.team))
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: "Invalid team ID for side1",
      });
    if (dto.side2.team && !isValidObjectId(dto.side2.team))
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: "Invalid team ID for side2",
      });

    if (!isOrganizer) await this.assertTradeParticipant(dto, sub);

    const side1Trade = {
      team: dto.side1.team ? new Types.ObjectId(dto.side1.team) : undefined,
      pokemon: dto.side1.pokemon.map((p) => ({
        id: p.id,
        addons: p.tera ? ["Tera Captain"] : undefined,
      })),
      tradePoints: dto.side1.team ? (dto.side1.tradePoints ?? 0) : 0,
    };
    const side2Trade = {
      team: dto.side2.team ? new Types.ObjectId(dto.side2.team) : undefined,
      pokemon: dto.side2.pokemon.map((p) => ({
        id: p.id,
        addons: p.tera ? ["Tera Captain"] : undefined,
      })),
      tradePoints: dto.side2.team ? (dto.side2.tradePoints ?? 0) : 0,
    };

    const status = isOrganizer ? "APPROVED" : "PENDING";
    if (status === "APPROVED")
      this.assertTradePointsWithinLimit(
        stageDoc,
        tournament,
        { side1: side1Trade, side2: side2Trade },
        null,
      );

    await this.makeTrade(
      stageDoc,
      side1Trade,
      side2Trade,
      dto.roundIndex,
      status,
    );
    return {
      message: isOrganizer
        ? "Trade processed successfully."
        : "Trade submitted for approval.",
      status: isOrganizer ? "APPROVED" : "PENDING",
    };
  }

  private assertTradePointsWithinLimit(
    stage: StageDocument,
    tournament: HostedTournament,
    trade: { side1: StageTradeSideEntity; side2: StageTradeSideEntity },
    exclude: StageTradeEntity | null,
  ) {
    assertTradePointsWithinLimit({
      trades: stage.trades,
      limit: tournament.tradePointLimit,
      trade,
      exclude,
    });
  }

  /** A coach may only file a trade that their own team is a side of. */
  private async assertTradeParticipant(dto: MakeTradeDto, sub: string) {
    const teamIds = [dto.side1.team, dto.side2.team].filter(
      (id): id is string => Boolean(id),
    );
    if (!teamIds.length) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const teams = await this.teamRepo.findManyByIds(teamIds);
    if (!teams.some((team) => isCoachedBy(team, sub)))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
  }

  /**
   * Records a trade between two teams in the same Stage, validating that
   * each side's offered Pokemon actually exist on that team's current
   * roster (post any earlier trades, walked via getRosterByRound) before
   * approving it.
   */
  private async makeTrade(
    stage: StageDocument,
    side1: StageTradeSideEntity,
    side2: StageTradeSideEntity,
    activeRoundIndex: number,
    status: "PENDING" | "APPROVED" = "APPROVED",
  ) {
    if (side1.team === undefined && side2.team === undefined) return;

    await this.assertTradeRostersValid(stage, { side1, side2 });

    stage.trades.push({
      side1,
      side2,
      timestamp: new Date(),
      activeRound: activeRoundIndex,
      status,
    } as StageTradeEntity);

    await stage.save();
  }

  /**
   * Each side may only offer Pokémon its team currently holds. Re-checked at
   * approval time, since a pending trade can go stale behind other trades.
   */
  private async assertTradeRostersValid(
    stage: StageDocument,
    trade: { side1: StageTradeSideEntity; side2: StageTradeSideEntity },
  ) {
    for (const side of [trade.side1, trade.side2]) {
      if (!side.team) continue;

      const team = await this.teamRepo.findByIdOrNull(side.team);
      if (!team)
        throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: side.team });

      // Resolved here rather than threaded through every caller: validating a
      // trade against the wrong set of earlier trades would reject a legitimate
      // offer, or accept one for a Pokémon the team no longer holds.
      const tournament = await this.axisTournament(stage);
      const rosterIds = new Set(
        getRosterByRound(team, rosterContext(stage, tournament ?? undefined))
          .map((pokemon) => pokemon.id),
      );
      for (const pokemon of side.pokemon) {
        if (!rosterIds.has(pokemon.id))
          throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
            pokemonId: pokemon.id,
            teamId: team._id.toString(),
          });
      }
    }
  }

  /** Organizer-only resolution of a coach-submitted trade. */
  async setTradeStatus(
    leagueSlug: string,
    tournamentSlug: string,
    stageSlug: string,
    tradeId: string,
    sub: string,
    dto: SetTradeStatusDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);
    this.assertStageOwnsItsSchedule(tournament, stageSlug);

    const stageDoc = await this.stageRepo.findBySlug(stageSlug);
    const trade = stageDoc.trades.find((t) => t._id?.toString() === tradeId);
    if (!trade) throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, { tradeId });

    if (trade.status !== "PENDING")
      throw new PDZError(ErrorCodes.STAGE.INVALID_TRADE, {
        reason: `Trade is already ${trade.status}`,
      });

    if (dto.status === "APPROVED") {
      await this.assertTradeRostersValid(stageDoc, trade);
      this.assertTradePointsWithinLimit(stageDoc, tournament, trade, trade);
    }

    trade.status = dto.status;
    await stageDoc.save();

    return {
      message: `Trade ${dto.status.toLowerCase()}.`,
      status: dto.status,
    };
  }

  async updateMatchup(
    leagueSlug: string,
    tournamentSlug: string,
    matchupSlug: string,
    sub: string,
    dto: UpdateMatchupDto,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    this.assertOrganizer(tournament, sub);

    const matchup = await this.matchupRepo.findBySlug(matchupSlug);
    // The slug alone does not say which tournament the match belongs to, and
    // being an organizer of one tournament must not authorize a write to
    // another's results.
    const stageDoc = matchup.stage
      ? await this.stageRepo.findByIdOrNull(matchup.stage)
      : null;
    if (!stageDoc || stageDoc.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug });

    matchup.results = this.buildMatchResults(dto.matches);

    if (dto.score) {
      matchup.side1.score = dto.score.team1;
      matchup.side2.score = dto.score.team2;
    }

    if (dto.winner) {
      if (
        dto.winner === "side1" ||
        dto.winner === "side2" ||
        dto.winner === "draw"
      ) {
        matchup.winner = dto.winner;
      } else if (dto.winner === "side1ffw") {
        matchup.winner = "side1";
        matchup.forfeit = true;
      } else if (dto.winner === "side2ffw") {
        matchup.winner = "side2";
        matchup.forfeit = true;
      } else if (dto.winner === "dffl") {
        matchup.winner = "draw";
        matchup.forfeit = true;
      }
    }

    if (dto.winner || matchup.results.length) matchup.status = "approved";
    matchup.report = undefined;
    await matchup.save();

    // Bracket advancement: fill in the winner/loser side of any downstream
    // matchup that references this one, so it becomes resolvable (visible
    // on the schedule) as soon as this result is recorded.
    if (dto.winner) await this.advanceBracket(matchup);

    return { message: "Schedule updated." };
  }
}
