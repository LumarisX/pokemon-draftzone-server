import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { toID } from "@pkmn/data";
import { Model, Types } from "mongoose";
import { TierList, TierListAccess, TierListMember } from "./tier-list.domain";
import { TierListMapper } from "./tier-list.mapper";
import {
  TierListDocument,
  TierListEntity,
  TierListRole,
  TierListVisibility,
} from "./tier-list.schema";
import { TierListState } from "./tier-list.state";

export type TierListScope = "mine" | "shared" | "public" | "featured";
export type TierListSort = "updated" | "forks" | "uses" | "name";

export type TierListSummary = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  authorName?: string;
  format: string;
  ruleset: string;
  tags: string[];
  tierCount: number;
  pokemonCount: number;
  visibility: TierListVisibility;
  featured: boolean;
  forkCount: number;
  useCount: number;
  copiedFrom?: { slug: string; name: string } | null;
  access: TierListAccess;
  role: "owner" | TierListRole | null;
  topPokemon: { id: string; name: string }[];
  updatedAt?: Date;
};

export type BrowseFilter = {
  sub?: string;
  scope: TierListScope;
  query?: string;
  format?: string;
  ruleset?: string;
  tag?: string;
  pokemon?: string;
  sort: TierListSort;
  limit: number;
  skip: number;
};

export type NewTierList = {
  name: string;
  description?: string;
  authorName?: string;
  createdBy: string;
  format: string;
  ruleset: string;
  visibility?: TierListVisibility;
  tags?: string[];
  copiedFrom?: Types.ObjectId;
  copiedFromVersion?: number;
  tournament?: Types.ObjectId;
  state?: TierListState;
};

const PRESET = { tournament: { $exists: false } };

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  async findDocument(idOrSlug: string): Promise<TierListDocument> {
    const doc = Types.ObjectId.isValid(idOrSlug)
      ? await this.tierListModel.findById(idOrSlug).exec()
      : await this.tierListModel.findOne({ slug: { $eq: idOrSlug } }).exec();
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return doc;
  }

  async findSlugAndName(
    tierListId: string | undefined,
  ): Promise<{ slug: string; name: string } | null> {
    if (!tierListId || !Types.ObjectId.isValid(tierListId)) return null;
    const doc = await this.tierListModel
      .findById(tierListId)
      .select("slug name")
      .lean()
      .exec();
    return doc ? { slug: doc.slug, name: doc.name } : null;
  }

  async browse(
    filter: BrowseFilter,
  ): Promise<{ rows: TierListSummary[]; total: number }> {
    const conditions: Record<string, unknown>[] = [PRESET];

    if (filter.scope === "mine") {
      if (!filter.sub) return { rows: [], total: 0 };
      conditions.push({ createdBy: filter.sub });
    } else if (filter.scope === "shared") {
      if (!filter.sub) return { rows: [], total: 0 };
      conditions.push({
        createdBy: { $ne: filter.sub },
        $or: [{ "members.sub": filter.sub }, { collaborators: filter.sub }],
      });
    } else {
      conditions.push({ "settings.isPublic": true });
      if (filter.scope === "featured") conditions.push({ featured: true });
    }

    if (filter.format) conditions.push({ format: { $eq: filter.format } });
    if (filter.ruleset) conditions.push({ ruleset: { $eq: filter.ruleset } });
    if (filter.tag) conditions.push({ tags: { $eq: normalizeTag(filter.tag) } });
    if (filter.pokemon) {
      const id = toID(filter.pokemon);
      if (id) conditions.push({ [`pokemon.${id}.tierId`]: { $exists: true } });
    }
    if (filter.query?.trim()) {
      const pattern = { $regex: escapeRegex(filter.query.trim()), $options: "i" };
      conditions.push({
        $or: [{ name: pattern }, { description: pattern }, { tags: pattern }],
      });
    }

    const sort: Record<string, 1 | -1> =
      filter.sort === "forks"
        ? { forkCount: -1, updatedAt: -1 }
        : filter.sort === "uses"
          ? { useCount: -1, updatedAt: -1 }
          : filter.sort === "name"
            ? { name: 1 }
            : { updatedAt: -1 };

    const query = { $and: conditions };
    const [docs, total] = await Promise.all([
      this.tierListModel
        .find(query)
        .sort(sort)
        .skip(filter.skip)
        .limit(filter.limit)
        .exec(),
      this.tierListModel.countDocuments(query).exec(),
    ]);

    const sources = await this.sourcesFor(docs);
    return {
      rows: docs.map((doc) => this.toSummary(doc, filter.sub, sources)),
      total,
    };
  }

  private async sourcesFor(
    docs: TierListDocument[],
  ): Promise<Map<string, { slug: string; name: string; visible: boolean }>> {
    const ids = [
      ...new Set(
        docs
          .map((doc) => doc.copiedFrom?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    if (!ids.length) return new Map();
    const found = await this.tierListModel
      .find({ _id: { $in: ids } })
      .select("slug name settings tournament")
      .lean()
      .exec();
    return new Map(
      found.map((doc) => [
        doc._id.toString(),
        {
          slug: doc.slug,
          name: doc.name,
          visible:
            !doc.tournament &&
            TierListMapper.visibilityOf(doc as TierListDocument) !== "private",
        },
      ]),
    );
  }

  toSummary(
    doc: TierListDocument,
    sub: string | undefined,
    sources: Map<string, { slug: string; name: string; visible: boolean }> = new Map(),
  ): TierListSummary {
    const tierList = TierListMapper.fromDatabase(doc);
    const access = tierList.presetAccess(sub);
    const source = doc.copiedFrom
      ? sources.get(doc.copiedFrom.toString())
      : undefined;
    const topTier = [...tierList.tiers].sort((a, b) => b.cost - a.cost)[0];
    const topPokemon = topTier
      ? [...tierList.pokemon.entries()]
          .filter(([, entry]) => entry.tierId === topTier.id && !entry.banned)
          .map(([id, entry]) => ({ id, name: entry.name }))
          .slice(0, 8)
      : [];
    const tiered = [...tierList.pokemon.values()].filter(
      (entry) => entry.tierId && !entry.banned,
    ).length;

    return {
      id: tierList.id,
      slug: tierList.slug,
      name: tierList.name,
      description: tierList.description,
      authorName: tierList.authorName,
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
      tags: tierList.tags,
      tierCount: tierList.tiers.length,
      pokemonCount: tiered,
      visibility: tierList.visibility,
      featured: tierList.featured,
      forkCount: tierList.forkCount,
      useCount: tierList.useCount,
      copiedFrom: !doc.copiedFrom
        ? undefined
        : source?.visible
          ? { slug: source.slug, name: source.name }
          : null,
      access,
      role:
        sub && tierList.createdBy === sub ? "owner" : tierList.memberRole(sub),
      topPokemon,
      updatedAt: tierList.updatedAt,
    };
  }

  async create(input: NewTierList): Promise<TierList> {
    const state = input.state;
    const visibility = input.visibility ?? "private";
    const [doc] = await this.tierListModel.create([
      {
        name: input.name,
        description: input.description,
        authorName: input.authorName,
        createdBy: input.createdBy,
        format: input.format,
        ruleset: input.ruleset,
        copiedFrom: input.copiedFrom,
        copiedFromVersion: input.copiedFromVersion,
        tournament: input.tournament,
        tags: input.tags ?? [],
        tiers: state
          ? state.tiers.map((tier) => ({
              _id: new Types.ObjectId(tier.id),
              name: tier.name,
              cost: tier.cost,
              color: tier.color,
            }))
          : [],
        pokemon: state
          ? new Map(
              Object.entries(state.pokemon).map(([id, entry]) => [
                id,
                {
                  ...entry,
                  tierId: entry.tierId
                    ? new Types.ObjectId(entry.tierId)
                    : undefined,
                },
              ]),
            )
          : new Map(),
        banned: state?.banned ?? { moves: [], abilities: [] },
        collaborators: [],
        members: [],
        settings: { isPublic: visibility === "public", visibility },
        version: 1,
      },
    ]);
    return TierListMapper.fromDatabase(doc);
  }

  async saveContent(tierList: TierList, expectedVersion: number): Promise<number> {
    const versionFilter =
      expectedVersion === 0
        ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
        : { version: expectedVersion };
    const doc = await this.tierListModel
      .findOneAndUpdate(
        { _id: tierList.id, ...versionFilter },
        {
          $set: {
            tiers: TierListMapper.toTierEntities(tierList.tiers),
            pokemon: TierListMapper.toPokemonEntityMap(tierList.pokemon),
            banned: tierList.banned,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after", projection: { version: 1 } },
      )
      .exec();
    if (!doc) {
      const exists = await this.tierListModel.exists({ _id: tierList.id });
      if (!exists) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
      throw new PDZError(ErrorCodes.TIER_LIST.STALE);
    }
    return doc.version;
  }

  async updateSettings(
    tierListId: string,
    update: Partial<{
      name: string;
      description: string | null;
      authorName: string;
      tags: string[];
      format: string;
      ruleset: string;
      visibility: TierListVisibility;
    }>,
  ): Promise<TierList> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};
    if (update.name !== undefined) $set.name = update.name;
    if (update.description !== undefined) {
      if (update.description) $set.description = update.description;
      else $unset.description = "";
    }
    if (update.authorName !== undefined) $set.authorName = update.authorName;
    if (update.tags !== undefined) $set.tags = update.tags;
    if (update.format !== undefined) $set.format = update.format;
    if (update.ruleset !== undefined) $set.ruleset = update.ruleset;
    if (update.visibility !== undefined) {
      $set["settings.visibility"] = update.visibility;
      $set["settings.isPublic"] = update.visibility === "public";
    }
    const doc = await this.tierListModel
      .findByIdAndUpdate(
        tierListId,
        { $set, ...(Object.keys($unset).length && { $unset }) },
        { returnDocument: "after" },
      )
      .exec();
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return TierListMapper.fromDatabase(doc);
  }

  async setFeatured(tierListId: string, featured: boolean): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $set: { featured } })
      .exec();
  }

  async addMember(tierListId: string, member: TierListMember): Promise<boolean> {
    const result = await this.tierListModel
      .updateOne(
        {
          _id: tierListId,
          createdBy: { $ne: member.sub },
          "members.sub": { $ne: member.sub },
        },
        {
          $push: { members: member },
          $pull: { collaborators: member.sub },
        },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  async setMemberRole(
    tierListId: string,
    sub: string,
    role: TierListRole,
  ): Promise<void> {
    const doc = await this.findDocument(tierListId);
    const members = TierListMapper.membersOf(doc).map((member) =>
      member.sub === sub ? { ...member, role } : member,
    );
    await this.tierListModel
      .updateOne(
        { _id: doc._id },
        { $set: { members, collaborators: [] } },
      )
      .exec();
  }

  async removeMember(tierListId: string, sub: string): Promise<void> {
    await this.tierListModel
      .updateOne(
        { _id: tierListId },
        { $pull: { members: { sub }, collaborators: sub } },
      )
      .exec();
  }

  async transferOwnership(
    tierListId: string,
    from: string,
    to: TierListMember,
    fromName?: string,
  ): Promise<boolean> {
    const doc = await this.findDocument(tierListId);
    if (doc.createdBy !== from) return false;
    const members = TierListMapper.membersOf(doc)
      .filter((member) => member.sub !== to.sub)
      .concat({ sub: from, name: fromName, role: "editor" });
    const result = await this.tierListModel
      .updateOne(
        { _id: doc._id, createdBy: from },
        {
          $set: {
            createdBy: to.sub,
            members,
            collaborators: [],
            ...(to.name && { authorName: to.name }),
          },
        },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  async incrementForkCount(tierListId: string): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $inc: { forkCount: 1 } })
      .exec();
  }

  async incrementUseCount(tierListId: string): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $inc: { useCount: 1 } })
      .exec();
  }

  async retire(tierListId: string): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $set: { retiredAt: new Date() } })
      .exec();
  }

  async setCopiedFromVersion(tierListId: string, version: number): Promise<void> {
    await this.tierListModel
      .updateOne({ _id: tierListId }, { $set: { copiedFromVersion: version } })
      .exec();
  }

  async countCopiesOf(tierListId: string): Promise<number> {
    return this.tierListModel
      .countDocuments({ copiedFrom: new Types.ObjectId(tierListId) })
      .exec();
  }

  async deleteById(tierListId: string): Promise<void> {
    const result = await this.tierListModel
      .findByIdAndDelete(tierListId)
      .exec();
    if (!result) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
  }
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
}
