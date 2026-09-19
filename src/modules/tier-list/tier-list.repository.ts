import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { TierList } from "./tier-list.domain";
import { TierListMapper } from "./tier-list.mapper";
import { TierListDocument, TierListEntity } from "./tier-list.schema";

export type TierListSummary = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  format: string;
  ruleset: string;
  tierCount: number;
  pokemonCount: number;
  isPublic: boolean;
  forkCount: number;
  copiedFrom?: string;
  isOwner: boolean;
  canEdit: boolean;
  updatedAt?: Date;
};

@Injectable()
export class TierListRepository {
  constructor(
    @InjectModel(TierListEntity.name)
    private readonly tierListModel: Model<TierListDocument>,
  ) {}

  async findById(tierListId: string): Promise<TierList> {
    return TierListMapper.fromDatabase(await this.findDocument(tierListId));
  }

  async findManyByIds(tierListIds: string[]): Promise<Map<string, TierList>> {
    const ids = [...new Set(tierListIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const docs = await this.tierListModel.find({ _id: { $in: ids } }).exec();
    return new Map(
      docs.map((doc) => [doc._id.toString(), TierListMapper.fromDatabase(doc)]),
    );
  }

  /**
   * Browse rows carry counts rather than the full pokemon map — a list can
   * hold hundreds of entries and the browser only shows totals.
   */
  async browse(filter: {
    sub?: string;
    scope: "mine" | "public";
    query?: string;
    format?: string;
    ruleset?: string;
    limit: number;
    skip: number;
  }): Promise<{ rows: TierListSummary[]; total: number }> {
    const conditions: Record<string, unknown> = {};

    if (filter.scope === "mine") {
      if (!filter.sub) return { rows: [], total: 0 };
      conditions.$or = [
        { createdBy: filter.sub },
        { collaborators: filter.sub },
      ];
    } else {
      conditions["settings.isPublic"] = true;
    }

    if (filter.format) conditions.format = filter.format;
    if (filter.ruleset) conditions.ruleset = filter.ruleset;
    if (filter.query?.trim()) {
      // Regex rather than $text so a partial word matches while typing.
      const safe = filter.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.name = { $regex: safe, $options: "i" };
    }

    const [docs, total] = await Promise.all([
      this.tierListModel
        .find(conditions)
        .sort({ updatedAt: -1 })
        .skip(filter.skip)
        .limit(filter.limit)
        .exec(),
      this.tierListModel.countDocuments(conditions).exec(),
    ]);

    return {
      rows: docs.map((doc) => this.toSummary(doc, filter.sub)),
      total,
    };
  }

  async create(tierList: {
    name: string;
    description?: string;
    createdBy: string;
    format: string;
    ruleset: string;
    copiedFrom?: Types.ObjectId;
    tiers?: TierListDocument["tiers"];
    pokemon?: TierListDocument["pokemon"];
    banned?: TierListDocument["banned"];
  }): Promise<TierList> {
    const doc = await this.tierListModel.create({
      ...tierList,
      tiers: tierList.tiers ?? [],
      pokemon: tierList.pokemon ?? new Map(),
      banned: tierList.banned ?? { moves: [], abilities: [] },
      collaborators: [],
      settings: { isPublic: false },
    });
    return TierListMapper.fromDatabase(doc);
  }

  async incrementForkCount(tierListId: string): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $inc: { forkCount: 1 } })
      .exec();
  }

  /**
   * Accepts a slug (what URLs carry) or an ObjectId (what a tournament's
   * `tierList` ref holds). Slugs are 8 base62 characters and ObjectIds are 24
   * hex, so the two can't be confused.
   */
  async findDocument(idOrSlug: string): Promise<TierListDocument> {
    const doc = Types.ObjectId.isValid(idOrSlug)
      ? await this.tierListModel.findById(idOrSlug).exec()
      : await this.tierListModel.findOne({ slug: idOrSlug }).exec();
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return doc;
  }

  async deleteById(tierListId: string): Promise<void> {
    const result = await this.tierListModel
      .findByIdAndDelete(tierListId)
      .exec();
    if (!result) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
  }

  private toSummary(doc: TierListDocument, sub?: string): TierListSummary {
    return {
      id: doc._id.toString(),
      slug: doc.slug,
      name: doc.name,
      description: doc.description,
      format: doc.format,
      ruleset: doc.ruleset,
      tierCount: doc.tiers.length,
      pokemonCount: doc.pokemon.size,
      isPublic: doc.settings.isPublic,
      forkCount: doc.forkCount ?? 0,
      copiedFrom: doc.copiedFrom?.toString(),
      isOwner: !!sub && doc.createdBy === sub,
      canEdit:
        !!sub && (doc.createdBy === sub || doc.collaborators.includes(sub)),
      updatedAt: (doc as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  async updateSettings(
    tierListId: string,
    update: Partial<{
      name: string;
      description: string;
    }>,
  ): Promise<TierList> {
    const doc = await this.tierListModel
      .findByIdAndUpdate(
        tierListId,
        { $set: update },
        { returnDocument: "after" },
      )
      .exec();
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return TierListMapper.fromDatabase(doc);
  }

  async save(tierList: TierList): Promise<void> {
    const result = await this.tierListModel
      .findByIdAndUpdate(tierList.id, {
        $set: {
          tiers: TierListMapper.toTierEntities(tierList.tiers),
          pokemon: TierListMapper.toPokemonEntityMap(tierList.pokemon),
          "banned.abilities": tierList.banned.abilities,
        },
      })
      .exec();
    if (!result) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
  }
}
