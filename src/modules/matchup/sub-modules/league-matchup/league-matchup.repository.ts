import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  LeagueMatchupDocument,
  LeagueMatchupEntity,
} from "./league-matchup.schema";

const TEAM_POPULATE = [
  { path: "side1.team", populate: { path: "coach" } },
  { path: "side2.team", populate: { path: "coach" } },
];

/**
 * Fills in the URL slug for documents about to be bulk-inserted.
 *
 * The bulk paths hand Mongo pre-built objects rather than saving documents, so
 * they cannot rely on the schema default the single-document path gets — a
 * matchup created by bracket generation would otherwise have no page to link
 * to.
 */
function withSlugs<T extends Partial<LeagueMatchupEntity>>(docs: T[]): T[] {
  return docs.map((doc) => (doc.slug ? doc : { ...doc, slug: generateSlug() }));
}

@Injectable()
export class LeagueMatchupRepository {
  constructor(
    @InjectModel(LeagueMatchupEntity.name)
    private readonly matchupModel: Model<LeagueMatchupDocument>,
  ) {}

  async findByStage(
    stageId: Types.ObjectId | string,
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: stageId,
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      .populate(TEAM_POPULATE)
      .exec();
  }

  /**
   * Scoped to the stage as well as the rounds. Rounds belong to the tournament
   * now, so every stage running at the same time shares them — filtering on
   * round alone would return the other stages' matchups too.
   */
  async findByRoundsInStage(
    stageId: Types.ObjectId | string,
    roundIds: (Types.ObjectId | string)[],
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: stageId,
        round: { $in: roundIds },
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      // Insertion order. The bracket view renders matches in the order it
      // receives them, so an unsorted query would reshuffle a bracket between
      // identical requests.
      .sort({ _id: 1 })
      .populate(TEAM_POPULATE)
      .exec();
  }

  async countByStage(stageId: Types.ObjectId | string): Promise<number> {
    return this.matchupModel.countDocuments({ stage: stageId }).exec();
  }

  /**
   * Bulk-insert pre-built matchup documents (bracket generation). Callers
   * are expected to have already assigned `_id`s so slot.matchId references
   * between the inserted matchups resolve.
   */
  async createMany(
    matchups: (Partial<LeagueMatchupEntity> & { _id: Types.ObjectId })[],
  ): Promise<LeagueMatchupDocument[]> {
    const inserted = await this.matchupModel.insertMany(withSlugs(matchups));
    return inserted as unknown as LeagueMatchupDocument[];
  }

  /**
   * A stage's matchups without team population — enough to diff structure
   * (slots, placement) and to tell which ones carry recorded results.
   */
  async findStructureByStage(stageId: Types.ObjectId | string) {
    return this.matchupModel
      .find({ stage: stageId })
      .select("round section bracketRound position label side1 side2 results")
      .sort({ _id: 1 })
      .lean();
  }

  /** As `findStructureByStage`, across a whole tournament's stages. */
  async findStructureByStages(stageIds: (Types.ObjectId | string)[]) {
    if (stageIds.length === 0) return [];
    return this.matchupModel
      .find({ stage: { $in: stageIds } })
      .select(
        "stage slug round section bracketRound position label side1 side2 results",
      )
      .sort({ _id: 1 })
      .lean();
  }

  /**
   * Just the fields `buildMatchLabels` numbers by. The schedule labels every
   * card, so this runs on every schedule read — it stays a narrow projection
   * rather than reusing `findStructureByStages`, which also drags along both
   * sides and every recorded result.
   */
  async findLabelFieldsByStages(stageIds: (Types.ObjectId | string)[]) {
    if (stageIds.length === 0) return [];
    return this.matchupModel
      .find({ stage: { $in: stageIds } })
      .select("stage slug round position label")
      .sort({ _id: 1 })
      .lean();
  }

  /**
   * Matchups in any of these stages that fall in any of these rounds.
   *
   * The stage filter is not redundant with the round filter: rounds belong to
   * the tournament, so a round is shared by every stage running in it, and a
   * hidden stage's matches must not leak into a public schedule.
   */
  async findByRoundsAcrossStages(
    stageIds: (Types.ObjectId | string)[],
    roundIds: (Types.ObjectId | string)[],
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    if (stageIds.length === 0 || roundIds.length === 0) return [];
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: { $in: stageIds },
        round: { $in: roundIds },
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      .sort({ _id: 1 })
      .populate(TEAM_POPULATE)
      .exec();
  }

  /** Every matchup across several stages, teams populated, in insertion order. */
  async findByStages(
    stageIds: (Types.ObjectId | string)[],
    options?: { teamIds?: (Types.ObjectId | string)[] },
  ) {
    if (stageIds.length === 0) return [];
    const hasTeamFilter = options?.teamIds && options.teamIds.length > 0;
    return this.matchupModel
      .find({
        stage: { $in: stageIds },
        ...(hasTeamFilter
          ? {
              $or: [
                { "side1.team": { $in: options!.teamIds } },
                { "side2.team": { $in: options!.teamIds } },
              ],
            }
          : undefined),
      })
      .sort({ _id: 1 })
      .populate(TEAM_POPULATE)
      .exec();
  }

  /**
   * Just enough of several stages' matchups to score the given teams: the
   * result fields, plus each side's raw team ref.
   *
   * Deliberately unpopulated. Scoring only ever reads a side's team `_id`, and
   * Mongoose defines `_id` on ObjectId itself, so an unpopulated ref answers
   * that the same way a populated document does — two populate round-trips per
   * call, each dragging a team and its coach along, would buy nothing.
   */
  async findScoringByStages(
    stageIds: (Types.ObjectId | string)[],
    teamIds: (Types.ObjectId | string)[],
  ) {
    if (stageIds.length === 0 || teamIds.length === 0) return [];
    return this.matchupModel
      .find({
        stage: { $in: stageIds },
        $or: [
          { "side1.team": { $in: teamIds } },
          { "side2.team": { $in: teamIds } },
        ],
      })
      .select(
        "round winner forfeit side1.team side1.score side2.team side2.score results",
      )
      .sort({ _id: 1 })
      .exec();
  }

  /**
   * Applies a whole bracket edit in one round-trip: inserts new matchups,
   * `$set`s structural fields on existing ones, and removes the rest. Updates
   * are dotted-path sets so recorded results and scores are left untouched.
   */
  async applyStructureDiff(options: {
    creates: (Partial<LeagueMatchupEntity> & { _id: Types.ObjectId })[];
    updates: { _id: Types.ObjectId; set: Record<string, unknown> }[];
    deletes: Types.ObjectId[];
  }): Promise<void> {
    const ops = [
      ...withSlugs(options.creates).map((doc) => ({
        insertOne: { document: doc },
      })),
      ...options.updates.map(({ _id, set }) => ({
        updateOne: { filter: { _id }, update: { $set: set } },
      })),
      ...(options.deletes.length
        ? [{ deleteMany: { filter: { _id: { $in: options.deletes } } } }]
        : []),
    ];
    if (ops.length === 0) return;
    await this.matchupModel.bulkWrite(ops as never);
  }

  async deleteByStage(stageId: Types.ObjectId | string): Promise<number> {
    const result = await this.matchupModel
      .deleteMany({ stage: stageId })
      .exec();
    return result.deletedCount;
  }

  async findByIdOrNull(matchupId: Types.ObjectId | string) {
    return this.matchupModel.findById(matchupId).exec();
  }

  /**
   * The matchup a URL names. Not scoped to a stage — the slug is unique across
   * the collection, so the stage would only ever confirm what the slug already
   * decided. Callers still have to check the matchup's stage belongs to the
   * tournament in the URL, which is an authorization question, not a lookup.
   */
  async findBySlug(slug: string) {
    const matchup = await this.matchupModel.findOne({ slug }).exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug: slug });
    return matchup;
  }

  async findBySlugPopulated(slug: string) {
    const matchup = await this.matchupModel
      .findOne({ slug })
      .populate(TEAM_POPULATE)
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug: slug });
    return matchup;
  }

  /**
   * Pushes a decided matchup's winner and loser into whatever consumes them.
   *
   * Deliberately not scoped to a stage. `slot.matchId` is a matchup `_id`, so
   * it already identifies the source uniquely — and once a playoff stage
   * consumes a group stage's results, the match feeding a slot lives in a
   * different stage than the slot does. A stage filter here would silently
   * stop advancing teams across that boundary.
   */
  async resolveDownstreamSlots(
    sourceMatchupId: Types.ObjectId | string,
    winnerTeamId?: Types.ObjectId,
    loserTeamId?: Types.ObjectId,
  ): Promise<void> {
    const sourceMatchIdStr = sourceMatchupId.toString();
    const updates: Promise<unknown>[] = [];

    for (const side of ["side1", "side2"] as const) {
      for (const [outcome, teamId] of [
        ["winner", winnerTeamId],
        ["loser", loserTeamId],
      ] as const) {
        if (!teamId) continue;
        updates.push(
          this.matchupModel
            .updateMany(
              {
                [`${side}.slot.type`]: outcome,
                [`${side}.slot.matchId`]: sourceMatchIdStr,
              },
              { $set: { [`${side}.team`]: teamId } },
            )
            .exec(),
        );
      }
    }

    await Promise.all(updates);
  }
}
