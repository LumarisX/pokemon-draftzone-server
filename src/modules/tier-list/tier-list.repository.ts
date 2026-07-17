import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TierList } from "./tier-list.domain";
import { TierListMapper } from "./tier-list.mapper";
import { TierListDocument, TierListEntity } from "./tier-list.schema";

@Injectable()
export class TierListRepository {
  constructor(
    @InjectModel(TierListEntity.name)
    private readonly tierListModel: Model<TierListDocument>,
  ) {}

  async findById(tierListId: string): Promise<TierList> {
    const doc = await this.tierListModel.findById(tierListId).exec();
    if (!doc) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
    return TierListMapper.fromDatabase(doc);
  }

  async updateSettings(
    tierListId: string,
    update: Partial<{
      name: string;
      description: string;
    }>,
  ): Promise<TierList> {
    const doc = await this.tierListModel
      .findByIdAndUpdate(tierListId, { $set: update }, { returnDocument: "after" })
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
