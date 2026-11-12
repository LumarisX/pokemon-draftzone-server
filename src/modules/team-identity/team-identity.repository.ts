import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { normalizeTeamName } from "@modules/team/domain/team-names";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types, isValidObjectId } from "mongoose";
import { SAVED_IDENTITY_LIMIT, SavedIdentity } from "./domain/saved-identities";
import {
  TeamIdentityDocument,
  TeamIdentityEntity,
} from "./team-identity.schema";

@Injectable()
export class TeamIdentityRepository {
  constructor(
    @InjectModel(TeamIdentityEntity.name)
    private readonly identityModel: Model<TeamIdentityDocument>,
  ) {}

  async listForOwner(owner: string): Promise<SavedIdentity[]> {
    const identities = await this.identityModel
      .find({ owner: { $eq: owner }, active: true }, { name: 1, logo: 1 })
      .sort({ lastUsedAt: -1 })
      .limit(SAVED_IDENTITY_LIMIT)
      .lean()
      .exec();
    return identities.map(toSaved);
  }

  async findOwned(
    id: string,
    owner: string,
  ): Promise<{ id: string; name: string; logo: string | undefined } | null> {
    const identity = await this.findActive(id, owner);
    return identity
      ? {
          id: identity._id.toString(),
          name: identity.name,
          logo: identity.logo || undefined,
        }
      : null;
  }

  async record(
    owner: string,
    name: string,
    logo: string | undefined,
  ): Promise<Types.ObjectId> {
    const nameKey = normalizeTeamName(name);
    const existing = await this.identityModel
      .findOne({
        owner: { $eq: owner },
        nameKey,
        logo: { $eq: logo || null },
        active: true,
      })
      .lean()
      .exec();

    if (existing) {
      await this.identityModel
        .updateOne({ _id: existing._id }, { $set: { lastUsedAt: new Date() } })
        .exec();
      return existing._id;
    }

    const created = await this.identityModel.create({
      owner,
      name: name.trim(),
      nameKey,
      ...(logo ? { logo } : {}),
      lastUsedAt: new Date(),
      active: true,
    });
    return created._id;
  }

  async rename(id: string, owner: string, name: string): Promise<SavedIdentity> {
    const identity = await this.findActive(id, owner);
    if (!identity) throw new PDZError(ErrorCodes.TEAM_IDENTITY.NOT_FOUND, { id });

    const nameKey = normalizeTeamName(name);
    const clash = await this.identityModel
      .exists({
        owner: { $eq: owner },
        nameKey,
        logo: { $eq: identity.logo ?? null },
        active: true,
        _id: { $ne: identity._id },
      })
      .exec();
    if (clash)
      throw new PDZError(ErrorCodes.TEAM_IDENTITY.NAME_TAKEN, {
        reason: `You already have "${name.trim()}" with that logo.`,
      });

    await this.identityModel
      .updateOne({ _id: identity._id }, { $set: { name: name.trim(), nameKey } })
      .exec();
    return { id, name: name.trim(), logo: identity.logo ?? null };
  }

  async remove(id: string, owner: string): Promise<void> {
    const identity = await this.findActive(id, owner);
    if (!identity) throw new PDZError(ErrorCodes.TEAM_IDENTITY.NOT_FOUND, { id });
    await this.identityModel
      .updateOne(
        { _id: identity._id },
        { $unset: { active: "" }, $set: { deletedAt: new Date() } },
      )
      .exec();
  }

  async ownerOf(id: Types.ObjectId | string): Promise<string | null> {
    const identity = await this.identityModel
      .findById(id, { owner: 1 })
      .lean()
      .exec();
    return identity?.owner ?? null;
  }

  private findActive(id: string, owner: string) {
    if (!isValidObjectId(id)) return Promise.resolve(null);
    return this.identityModel
      .findOne({
        _id: new Types.ObjectId(id),
        owner: { $eq: owner },
        active: true,
      })
      .lean()
      .exec();
  }
}

function toSaved(identity: {
  _id: Types.ObjectId;
  name: string;
  logo?: string;
}): SavedIdentity {
  return {
    id: identity._id.toString(),
    name: identity.name,
    logo: identity.logo ?? null,
  };
}
