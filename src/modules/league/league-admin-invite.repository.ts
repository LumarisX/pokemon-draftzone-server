import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  LeagueAdminInviteDocument,
  LeagueAdminInviteEntity,
} from "./league-admin-invite.schema";

export type CreateLeagueAdminInviteInput = {
  leagueId: Types.ObjectId;
  tokenHash: string;
  name: string;
  createdBy: string;
  expiresAt: Date;
};

@Injectable()
export class LeagueAdminInviteRepository {
  constructor(
    @InjectModel(LeagueAdminInviteEntity.name)
    private readonly inviteModel: Model<LeagueAdminInviteDocument>,
  ) {}

  private pendingFilter(now: Date) {
    return { acceptedAt: { $exists: false }, expiresAt: { $gt: now } };
  }

  async create(
    input: CreateLeagueAdminInviteInput,
  ): Promise<LeagueAdminInviteDocument> {
    return this.inviteModel.create(input);
  }

  async findPendingByLeague(
    leagueId: Types.ObjectId,
  ): Promise<LeagueAdminInviteDocument[]> {
    return this.inviteModel
      .find({ leagueId, ...this.pendingFilter(new Date()) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async countPendingByLeague(leagueId: Types.ObjectId): Promise<number> {
    return this.inviteModel
      .countDocuments({ leagueId, ...this.pendingFilter(new Date()) })
      .exec();
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<LeagueAdminInviteDocument | null> {
    return this.inviteModel.findOne({ tokenHash: { $eq: tokenHash } }).exec();
  }

  async claim(
    tokenHash: string,
    sub: string,
  ): Promise<LeagueAdminInviteDocument | null> {
    const now = new Date();
    return this.inviteModel
      .findOneAndUpdate(
        { tokenHash: { $eq: tokenHash }, ...this.pendingFilter(now) },
        { $set: { acceptedBy: sub, acceptedAt: now } },
        { new: true },
      )
      .exec();
  }

  async release(inviteId: Types.ObjectId): Promise<void> {
    await this.inviteModel
      .updateOne(
        { _id: inviteId },
        { $unset: { acceptedBy: "", acceptedAt: "" } },
      )
      .exec();
  }

  async deletePending(
    leagueId: Types.ObjectId,
    inviteId: string,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(inviteId)) return false;
    const result = await this.inviteModel
      .deleteOne({
        _id: new Types.ObjectId(inviteId),
        leagueId,
        acceptedAt: { $exists: false },
      })
      .exec();
    return result.deletedCount > 0;
  }
}
