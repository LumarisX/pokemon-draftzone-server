import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserSignInDocument, UserSignInEntity } from "./user-sign-in.schema";

export interface SignInRow {
  signIn: string;
  accountId: string;
  blocked: boolean;
}

function toRow(doc: UserSignInDocument): SignInRow {
  return {
    signIn: doc.signIn,
    accountId: doc.accountId,
    blocked: doc.blocked === true,
  };
}

@Injectable()
export class UserSignInRepository {
  constructor(
    @InjectModel(UserSignInEntity.name)
    private readonly model: Model<UserSignInDocument>,
  ) {}

  async find(signIn: string): Promise<SignInRow | null> {
    const doc = await this.model.findOne({ signIn: { $eq: signIn } }).exec();
    return doc ? toRow(doc) : null;
  }

  async listByAccount(accountId: string): Promise<SignInRow[]> {
    const docs = await this.model
      .find({ accountId: { $eq: accountId } })
      .exec();
    return docs.map(toRow);
  }

  async block(signIn: string, accountId: string, now: Date): Promise<void> {
    await this.model
      .updateOne(
        { signIn: { $eq: signIn }, accountId: { $eq: accountId } },
        { $set: { blocked: true, blockedAt: now } },
        { upsert: true },
      )
      .exec();
  }

  async unblock(signIn: string, accountId: string): Promise<void> {
    await this.model
      .updateOne(
        { signIn: { $eq: signIn }, accountId: { $eq: accountId } },
        { $set: { blocked: false }, $unset: { blockedAt: "" } },
      )
      .exec();
  }

  async point(signIn: string, accountId: string): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { signIn: { $eq: signIn } },
        { $setOnInsert: { accountId, blocked: false } },
        { upsert: true },
      )
      .exec();
    return result.upsertedCount === 1;
  }

  async repoint(signIn: string, from: string, to: string): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { signIn: { $eq: signIn }, accountId: { $eq: from } },
        { $set: { accountId: to } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async remove(signIn: string, accountId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({ signIn: { $eq: signIn }, accountId: { $eq: accountId } })
      .exec();
    return result.deletedCount === 1;
  }
}
