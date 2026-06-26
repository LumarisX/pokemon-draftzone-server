import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserDocument, UserEntity, UserSettingsEntity } from "./user.schema";
import { User } from "./user.domain";
import { UserMapper } from "./user.mapper";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getUserBySub(sub: string): Promise<User> {
    const userDoc = await this.userModel
      .findOne({ auth0Sub: { $eq: sub } })
      .exec();
    if (!userDoc) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    return UserMapper.fromDatabase(userDoc);
  }

  async updateUser(user: User): Promise<UserDocument> {
    return await this.userModel
      .findOneAndUpdate(
        { auth0Sub: { $eq: user.sub } },
        {
          $set: {
            lastLogin: user.lastLogin,
            settings: user.settings,
          },
          $setOnInsert: {
            joined: user.joined,
            lastCheckedAdsAt: new Date(0),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async updateSettings(
    sub: string,
    settingsPayload: UserSettingsEntity,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findOneAndUpdate(
        { auth0Sub: { $eq: sub } },
        { $set: { settings: settingsPayload } },
        { new: true },
      )
      .exec();

    if (!user) throw new PDZError(ErrorCodes.USER.NOT_FOUND);
    return user;
  }
}
