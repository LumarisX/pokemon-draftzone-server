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
  {
    path: "side1.team",
    populate: [{ path: "primaryCoach" }, { path: "coaches" }],
  },
  {
    path: "side2.team",
    populate: [{ path: "primaryCoach" }, { path: "coaches" }],
  },
];

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
      .sort({ _id: 1 })
      .populate(TEAM_POPULATE)
      .exec();
  }

  async countByStage(stageId: Types.ObjectId | string): Promise<number> {
    return this.matchupModel.countDocuments({ stage: stageId }).exec();
  }

  async createMany(
    matchups: (Partial<LeagueMatchupEntity> & { _id: Types.ObjectId })[],
  ): Promise<LeagueMatchupDocument[]> {
    const inserted = await this.matchupModel.insertMany(withSlugs(matchups));
    return inserted as unknown as LeagueMatchupDocument[];
  }

  async findStructureByStage(stageId: Types.ObjectId | string) {
    return this.matchupModel
      .find({ stage: stageId })
      .select("round section bracketRound position label side1 side2 results")
      .sort({ _id: 1 })
      .lean();
  }

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

  async findLabelFieldsByStages(stageIds: (Types.ObjectId | string)[]) {
    if (stageIds.length === 0) return [];
    return this.matchupModel
      .find({ stage: { $in: stageIds } })
      .select("stage slug round position label")
      .sort({ _id: 1 })
      .lean();
  }

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
        "round winner forfeit scheduledDate side1.team side1.score side2.team side2.score results",
      )
      .sort({ _id: 1 })
      .exec();
  }

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

  async findByIdInTournament(
    tournamentId: Types.ObjectId | string,
    matchupId: Types.ObjectId | string,
  ) {
    return this.matchupModel
      .findOne({ _id: matchupId, tournamentId })
      .exec();
  }

  async findBySlug(tournamentId: Types.ObjectId | string, slug: string) {
    const matchup = await this.matchupModel
      .findOne({ slug: { $eq: slug }, tournamentId })
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug: slug });
    return matchup;
  }

  async findBySlugPopulated(
    tournamentId: Types.ObjectId | string,
    slug: string,
  ) {
    const matchup = await this.matchupModel
      .findOne({ slug: { $eq: slug }, tournamentId })
      .populate(TEAM_POPULATE)
      .exec();
    if (!matchup)
      throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupSlug: slug });
    return matchup;
  }

  async findAdvancementFieldsByStages(stageIds: (Types.ObjectId | string)[]) {
    if (stageIds.length === 0) return [];
    return this.matchupModel
      .find({ stage: { $in: stageIds } })
      .select("winner advances side1.slot side1.team side2.slot side2.team")
      .sort({ _id: 1 })
      .lean();
  }

  async applyAdvancementDiff(
    changes: {
      _id: Types.ObjectId | string;
      side: "side1" | "side2";
      team: Types.ObjectId | null;
    }[],
  ): Promise<void> {
    if (changes.length === 0) return;
    await this.matchupModel.bulkWrite(
      changes.map(({ _id, side, team }) => ({
        updateOne: {
          filter: { _id },
          update: team
            ? { $set: { [`${side}.team`]: team } }
            : { $unset: { [`${side}.team`]: "" } },
        },
      })) as never,
    );
  }

}
