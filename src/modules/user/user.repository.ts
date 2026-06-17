import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserDocument, UserEntity, UserSettingsEntity } from "./user.schema";

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getUserBySub(sub: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ auth0Sub: sub }).exec();
    if (!user) throw new NotFoundException(`User with sub "${sub}" not found`);
    return user;
  }

  async upsertFromWebhook(
    sub: string,
    payload: { lastLogin: Date; joined: Date; settings: UserSettingsEntity },
  ): Promise<UserDocument> {
    return await this.userModel
      .findOneAndUpdate(
        { auth0Sub: sub },
        {
          $set: {
            lastLogin: payload.lastLogin,
            settings: payload.settings,
          },
          $setOnInsert: {
            joined: payload.joined,
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
