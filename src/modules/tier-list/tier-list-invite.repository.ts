import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  TierListInviteDocument,
  TierListInviteEntity,
} from "./tier-list-invite.schema";
import { TierListRole } from "./tier-list.schema";

@Injectable()
export class TierListInviteRepository {
  constructor(
    @InjectModel(TierListInviteEntity.name)
    private readonly inviteModel: Model<TierListInviteDocument>,
  ) {}

  private openFilter(now: Date) {
    return {
      expiresAt: { $gt: now },
      $expr: { $lt: [{ $size: "$acceptedBy" }, "$maxUses"] },
    };
  }

  async create(input: {
    tierListId: string;
    tokenHash: string;
    role: TierListRole;
    createdBy: string;
    expiresAt: Date;
    maxUses: number;
  }): Promise<TierListInviteDocument> {
    const [doc] = await this.inviteModel.create([
      {
        tierList: new Types.ObjectId(input.tierListId),
        tokenHash: input.tokenHash,
        role: input.role,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        acceptedBy: [],
      },
    ]);
    return doc;
  }

  async findOpen(tierListId: string): Promise<TierListInviteDocument[]> {
    return this.inviteModel
      .find({
        tierList: new Types.ObjectId(tierListId),
        ...this.openFilter(new Date()),
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async countOpen(tierListId: string): Promise<number> {
    return this.inviteModel
      .countDocuments({
        tierList: new Types.ObjectId(tierListId),
        ...this.openFilter(new Date()),
      })
      .exec();
  }

  async findOpenByHash(
    tokenHash: string,
  ): Promise<TierListInviteDocument | null> {
    return this.inviteModel
      .findOne({ tokenHash: { $eq: tokenHash }, ...this.openFilter(new Date()) })
      .exec();
  }

  async claim(
    tokenHash: string,
    sub: string,
  ): Promise<TierListInviteDocument | null> {
    return this.inviteModel
      .findOneAndUpdate(
        {
          tokenHash: { $eq: tokenHash },
          acceptedBy: { $ne: sub },
          ...this.openFilter(new Date()),
        },
        { $push: { acceptedBy: sub } },
        { returnDocument: "after" },
      )
      .exec();
  }

  async release(inviteId: Types.ObjectId, sub: string): Promise<void> {
    await this.inviteModel
      .updateOne({ _id: inviteId }, { $pull: { acceptedBy: sub } })
      .exec();
  }

  async revoke(tierListId: string, inviteId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(inviteId)) return false;
    const result = await this.inviteModel
      .deleteOne({
        _id: new Types.ObjectId(inviteId),
        tierList: new Types.ObjectId(tierListId),
      })
      .exec();
    return result.deletedCount > 0;
  }

  async deleteForTierList(tierListId: string): Promise<void> {
    await this.inviteModel
      .deleteMany({ tierList: new Types.ObjectId(tierListId) })
      .exec();
  }
}
