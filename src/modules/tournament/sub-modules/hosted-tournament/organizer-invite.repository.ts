import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  OrganizerInviteDocument,
  OrganizerInviteEntity,
} from "./organizer-invite.schema";

export type CreateOrganizerInviteInput = {
  tournamentId: string;
  tokenHash: string;
  name: string;
  createdBy: string;
  expiresAt: Date;
};

@Injectable()
export class OrganizerInviteRepository {
  constructor(
    @InjectModel(OrganizerInviteEntity.name)
    private readonly inviteModel: Model<OrganizerInviteDocument>,
  ) {}

  private pendingFilter(now: Date) {
    return { acceptedAt: { $exists: false }, expiresAt: { $gt: now } };
  }

  async create(
    input: CreateOrganizerInviteInput,
  ): Promise<OrganizerInviteDocument> {
    return this.inviteModel.create({
      ...input,
      tournamentId: new Types.ObjectId(input.tournamentId),
    });
  }

  async findPendingByTournament(
    tournamentId: string,
  ): Promise<OrganizerInviteDocument[]> {
    return this.inviteModel
      .find({
        tournamentId: new Types.ObjectId(tournamentId),
        ...this.pendingFilter(new Date()),
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async countPendingByTournament(tournamentId: string): Promise<number> {
    return this.inviteModel
      .countDocuments({
        tournamentId: new Types.ObjectId(tournamentId),
        ...this.pendingFilter(new Date()),
      })
      .exec();
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<OrganizerInviteDocument | null> {
    return this.inviteModel.findOne({ tokenHash: { $eq: tokenHash } }).exec();
  }

  async claim(
    tokenHash: string,
    sub: string,
  ): Promise<OrganizerInviteDocument | null> {
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

  async deletePending(tournamentId: string, inviteId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(inviteId)) return false;
    const result = await this.inviteModel
      .deleteOne({
        _id: new Types.ObjectId(inviteId),
        tournamentId: new Types.ObjectId(tournamentId),
        acceptedAt: { $exists: false },
      })
      .exec();
    return result.deletedCount > 0;
  }
}
