import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ImportAliasDocument, ImportAliasEntity } from "./import-alias.schema";

export const MAX_ALIASES_PER_USER = 2000;

@Injectable()
export class ImportAliasRepository {
  constructor(
    @InjectModel(ImportAliasEntity.name)
    private readonly aliasModel: Model<ImportAliasDocument>,
  ) {}

  async forOwner(owner: string): Promise<Map<string, string[]>> {
    const docs = await this.aliasModel
      .find({ owner: { $eq: owner } })
      .select("text pokemonIds")
      .lean()
      .exec();
    return new Map(docs.map((doc) => [doc.text, doc.pokemonIds]));
  }

  async count(owner: string): Promise<number> {
    return this.aliasModel.countDocuments({ owner: { $eq: owner } }).exec();
  }

  async upsertMany(
    owner: string,
    entries: { text: string; pokemonIds: string[] }[],
  ): Promise<void> {
    if (!entries.length) return;
    await this.aliasModel.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: { owner, text: entry.text },
          update: { $set: { pokemonIds: entry.pokemonIds } },
          upsert: true,
        },
      })),
    );
  }

  async clear(owner: string): Promise<number> {
    const result = await this.aliasModel.deleteMany({ owner: { $eq: owner } }).exec();
    return result.deletedCount;
  }
}
