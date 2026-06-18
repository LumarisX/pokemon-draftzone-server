import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserDocument, UserEntity, UserSettingsEntity } from "./user.schema";
import { User } from "./user.domain";
import { UserMapper } from "./user.mapper";

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getUserBySub(sub: string): Promise<User> {
    const userDoc = await this.userModel.findOne({ auth0Sub: sub }).exec();
    if (!userDoc)
      throw new NotFoundException(`User with sub "${sub}" not found`);
    return UserMapper.fromDatabase(userDoc);
  }

  async updateUser(user: User): Promise<UserDocument> {
    return await this.userModel
      .findOneAndUpdate(
        { auth0Sub: user.sub },
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
        { auth0Sub: sub },
        { $set: { settings: settingsPayload } },
        { new: true },
      )
      .exec();

    if (!user)
      throw new NotFoundException(`User with sub "${sub}" does not exist`);
    return user;
  }
}
