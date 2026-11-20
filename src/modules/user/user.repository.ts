import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AccountIdentityService } from "./account-identity.service";
import { User } from "./user.domain";
import { defaultDisplayName } from "./user.identity";
import { UserMapper } from "./user.mapper";
import {
  UserDocument,
  UserEntity,
  UserRole,
  UserSettingsEntity,
} from "./user.schema";

const DUPLICATE_KEY = 11000;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === DUPLICATE_KEY;
}

export interface PersonNames {
  profileId: string;
  displayName: string | null;
  username: string | null;
  deletionScheduled?: boolean;
}

export interface DueDeletion {
  accountId: string;
  profileId: string;
  signIn: string;
  requestedAt: Date;
  scheduledFor: Date;
  tombstone: string | null;
}

export interface PublicCard {
  accountId: string;
  profileId: string;
  displayName: string | null;
  username: string | null;
  joined: Date;
  privateProfile: boolean;
}

export interface AccountRecord {
  accountId: string;
  profileId: string;
  signIn: string;
  displayName: string | null;
  profile: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  privateProfile: boolean;
  roles: UserRole[];
  joined: Date;
  lastLogin: Date;
}

function plain(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  const source = value as { toObject?: () => Record<string, unknown> };
  return typeof source.toObject === "function"
    ? source.toObject()
    : { ...(value as Record<string, unknown>) };
}

function toAccountRecord(doc: UserDocument): AccountRecord {
  return {
    accountId: String(doc._id),
    profileId: String(doc._id),
    signIn: doc.auth0Sub,
    displayName: doc.displayName ?? null,
    profile: plain(doc.profile),
    settings: plain(doc.settings),
    privateProfile: doc.privateProfile === true,
    roles: doc.roles ?? [],
    joined: doc.joined,
    lastLogin: doc.lastLogin,
  };
}

export interface UserFieldChanges {
  set?: Record<string, unknown>;
  unset?: string[];
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
    private readonly identity: AccountIdentityService,
  ) {}

  async resolveAccountId(signIn: string, now: Date): Promise<string> {
    const existing = await this.userModel
      .findOne({ auth0Sub: { $eq: signIn } }, { _id: 1 })
      .exec();
    if (existing) return String(existing._id);

    const created = await this.upsert(
      { auth0Sub: { $eq: signIn } },
      {
        $setOnInsert: {
          joined: now,
          lastLogin: now,
          lastCheckedAdsAt: new Date(0),
          settings: {},
          roles: [],
        },
      },
    );
    return String(created._id);
  }

  async getUserBySub(sub: string): Promise<User> {
    const filter = this.byAccount(sub);
    if (!filter) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    const userDoc = await this.userModel.findOne(filter).exec();
    if (!userDoc) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    return this.toDomain(await this.withDisplayName(userDoc));
  }

  async getOrCreateUserBySub(sub: string, now: Date): Promise<User> {
    const filter = this.byAccount(sub);
    if (!filter) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    const existing = await this.userModel.findOne(filter).exec();
    if (existing) return this.toDomain(await this.withDisplayName(existing));
    if (this.identity.internal) throw new PDZError(ErrorCodes.USER.NOT_FOUND);

    const created = await this.upsert(filter, {
      $setOnInsert: {
        displayName: defaultDisplayName(undefined),
        joined: now,
        lastLogin: now,
        lastCheckedAdsAt: new Date(0),
        settings: {},
        roles: [],
      },
    });
    return this.toDomain(await this.withDisplayName(created));
  }

  private async withDisplayName(doc: UserDocument): Promise<UserDocument> {
    if (doc.displayName) return doc;
    const filled = await this.userModel
      .findOneAndUpdate(
        { _id: doc._id, displayName: { $exists: false } },
        { $set: { displayName: defaultDisplayName(doc.username) } },
        { returnDocument: "after" },
      )
      .exec();
    if (filled) return filled;
    return (await this.userModel.findById(doc._id).exec()) ?? doc;
  }

  async findManyBySubs(subs: string[]): Promise<UserDocument[]> {
    if (subs.length === 0) return [];
    let filter: Record<string, unknown>;
    if (this.identity.internal) {
      const ids = subs
        .filter((sub) => OBJECT_ID_PATTERN.test(sub))
        .map((sub) => new Types.ObjectId(sub));
      if (ids.length === 0) return [];
      filter = { _id: { $in: ids } };
    } else {
      filter = { auth0Sub: { $in: subs } };
    }
    return this.userModel
      .find(filter, { auth0Sub: 1, username: 1, displayName: 1, deletion: 1 })
      .exec();
  }

  async findNamesByAccounts(
    accountIds: string[],
  ): Promise<Map<string, PersonNames>> {
    const docs = await this.findManyBySubs(accountIds);
    return new Map(
      docs.map((doc) => [
        this.identity.internal ? String(doc._id) : doc.auth0Sub,
        {
          profileId: String(doc._id),
          displayName: doc.displayName ?? null,
          username: doc.username ?? null,
          deletionScheduled: Boolean(doc.deletion),
        },
      ]),
    );
  }

  async findDueDeletions(now: Date): Promise<DueDeletion[]> {
    const docs = await this.userModel
      .find({ "deletion.scheduledFor": { $lte: now } })
      .lean()
      .exec();
    return docs.map((doc) => ({
      accountId: this.identity.internal ? String(doc._id) : doc.auth0Sub,
      profileId: String(doc._id),
      signIn: doc.auth0Sub,
      requestedAt: doc.deletion!.requestedAt,
      scheduledFor: doc.deletion!.scheduledFor,
      tombstone: doc.deletion!.tombstone ?? null,
    }));
  }

  async findRawByAccount(
    accountId: string,
  ): Promise<Record<string, unknown> | null> {
    const filter = this.byAccount(accountId);
    if (!filter) return null;
    const doc = await this.userModel.findOne(filter).lean().exec();
    return doc ? (doc as unknown as Record<string, unknown>) : null;
  }

  async updateUser(user: User): Promise<UserDocument> {
    const setFields: Partial<UserEntity> = {
      lastLogin: user.lastLogin,
    };
    if (user.username !== undefined) setFields.username = user.username;
    if (user.roles !== undefined) setFields.roles = user.roles;

    const doc = await this.upsert(
      { auth0Sub: { $eq: user.signIn ?? user.sub } },
      {
        $set: setFields,
        $setOnInsert: {
          displayName: defaultDisplayName(user.username),
          joined: user.joined,
          lastCheckedAdsAt: new Date(0),
          settings: {},
        },
      },
    );
    return this.withDisplayName(doc);
  }

  async updateSettings(
    sub: string,
    settingsPayload: UserSettingsEntity,
  ): Promise<UserDocument> {
    const filter = this.byAccount(sub);
    if (!filter) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    const user = await this.userModel
      .findOneAndUpdate(
        filter,
        { $set: { settings: settingsPayload } },
        { returnDocument: "after" },
      )
      .exec();

    if (!user) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    return user;
  }

  async applyChanges(sub: string, changes: UserFieldChanges): Promise<User> {
    const filter = this.byAccount(sub);
    if (!filter) throw new PDZError(ErrorCodes.USER.NOT_FOUND);

    const update: Record<string, unknown> = {};
    if (changes.set && Object.keys(changes.set).length > 0) {
      update.$set = changes.set;
    }
    if (changes.unset && changes.unset.length > 0) {
      update.$unset = Object.fromEntries(
        changes.unset.map((field) => [field, ""]),
      );
    }

    let doc: UserDocument | null;
    try {
      doc = await this.userModel
        .findOneAndUpdate(filter, update, {
          returnDocument: "after",
        })
        .exec();
    } catch (error) {
      if (isDuplicateKey(error))
        throw new PDZError(ErrorCodes.USER.DISCORD_ALREADY_CONNECTED, {
          heldBy: "other",
        });
      throw error;
    }

    if (!doc) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    return this.toDomain(doc);
  }

  async findDiscordHolder(
    discordId: string,
  ): Promise<{ accountId: string; signIn: string } | null> {
    const doc = await this.userModel
      .findOne(
        {
          $or: [
            { "discord.id": { $eq: discordId } },
            { auth0Sub: { $eq: `oauth2|discord|${discordId}` } },
          ],
        },
        { auth0Sub: 1 },
      )
      .exec();
    if (!doc) return null;
    return {
      accountId: this.identity.internal ? String(doc._id) : doc.auth0Sub,
      signIn: doc.auth0Sub,
    };
  }

  async profileOwnerSub(profileId: string): Promise<string | null> {
    if (!OBJECT_ID_PATTERN.test(profileId)) return null;
    const doc = await this.userModel
      .findOne({ _id: new Types.ObjectId(profileId) }, { auth0Sub: 1 })
      .exec();
    if (!doc) return null;
    return this.identity.internal ? String(doc._id) : doc.auth0Sub;
  }

  async findPublicCardById(profileId: string): Promise<PublicCard | null> {
    if (!OBJECT_ID_PATTERN.test(profileId)) return null;
    const doc = await this.userModel
      .findOne(
        {
          _id: new Types.ObjectId(profileId),
          deletion: { $exists: false },
        },
        {
          auth0Sub: 1,
          username: 1,
          displayName: 1,
          joined: 1,
          privateProfile: 1,
        },
      )
      .exec();
    if (!doc) return null;
    return {
      accountId: this.identity.internal ? String(doc._id) : doc.auth0Sub,
      profileId: String(doc._id),
      displayName: doc.displayName ?? null,
      username: doc.username ?? null,
      joined: doc.joined,
      privateProfile: doc.privateProfile === true,
    };
  }

  async findAccountByProfileId(
    profileId: string,
  ): Promise<AccountRecord | null> {
    if (!OBJECT_ID_PATTERN.test(profileId)) return null;
    const doc = await this.userModel
      .findOne({ _id: new Types.ObjectId(profileId) })
      .exec();
    return doc ? toAccountRecord(doc) : null;
  }

  async findRawAccount(accountId: string): Promise<Record<string, unknown> | null> {
    if (!OBJECT_ID_PATTERN.test(accountId)) return null;
    const doc = await this.userModel
      .findOne({ _id: new Types.ObjectId(accountId) })
      .lean()
      .exec();
    return doc ? (doc as unknown as Record<string, unknown>) : null;
  }

  async restoreRawAccount(doc: Record<string, unknown>): Promise<void> {
    await this.userModel.collection.replaceOne({ _id: doc._id as never }, doc, {
      upsert: true,
    });
  }

  async accountExists(accountId: string): Promise<boolean> {
    const filter = this.byAccount(accountId);
    if (!filter) return false;
    const doc = await this.userModel.findOne(filter, { _id: 1 }).exec();
    return doc !== null;
  }

  async touchAccount(
    accountId: string,
    lastLogin: Date,
  ): Promise<UserDocument | null> {
    const filter = this.byAccount(accountId);
    if (!filter) return null;
    return this.userModel
      .findOneAndUpdate(
        filter,
        { $set: { lastLogin } },
        { returnDocument: "after" },
      )
      .exec();
  }

  async removeAccount(accountId: string, signIn: string): Promise<boolean> {
    const filter = this.byAccount(accountId);
    if (!filter) return false;
    const result = await this.userModel
      .deleteOne({ ...filter, auth0Sub: { $eq: signIn } })
      .exec();
    return result.deletedCount === 1;
  }

  async cancelDeletion(accountId: string): Promise<boolean> {
    const filter = this.byAccount(accountId);
    if (!filter) return false;
    const result = await this.userModel
      .updateOne(
        { ...filter, "deletion.tombstone": { $exists: false } },
        { $unset: { deletion: "" } },
      )
      .exec();
    return result.matchedCount > 0;
  }

  private byAccount(accountId: string): Record<string, unknown> | null {
    if (!this.identity.internal) return { auth0Sub: { $eq: accountId } };
    if (!OBJECT_ID_PATTERN.test(accountId)) return null;
    return { _id: new Types.ObjectId(accountId) };
  }

  private toDomain(doc: UserDocument): User {
    return UserMapper.fromDatabase(doc, this.identity.internal);
  }

  private async upsert(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<UserDocument> {
    const run = () =>
      this.userModel
        .findOneAndUpdate(filter, update, {
          upsert: true,
          returnDocument: "after",
        })
        .exec();
    try {
      return await run();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return await run();
    }
  }
}
