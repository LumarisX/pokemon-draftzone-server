import { UserDocument, UserEntity } from "@modules/user/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

export type BucketUnit = "day" | "week" | "month";

export type LoginProvider = "google" | "discord" | "auth0" | "other";

export interface BucketCount {
  date: Date;
  count: number;
}

export interface ProviderCount {
  provider: LoginProvider;
  count: number;
}

export type EngagementSegment = "7d" | "30d" | "90d" | "dormant";
export type AgeSegment = "lt1m" | "1to3m" | "3to6m" | "6to12m" | "gt1y";

export interface KeyedCount<K extends string> {
  key: K;
  count: number;
}

export interface ValueCount {
  value: string;
  count: number;
}

export interface SettingsDistributions {
  theme: ValueCount[];
  spriteSet: ValueCount[];
  shinyUnlock: ValueCount[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminRepository {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async countUsers(): Promise<number> {
    return this.userModel.estimatedDocumentCount().exec();
  }

  async countSince(
    field: "joined" | "lastLogin",
    since: Date,
  ): Promise<number> {
    return this.userModel.countDocuments({ [field]: { $gte: since } }).exec();
  }

  async bucketByDate(
    field: "joined" | "lastLogin",
    unit: BucketUnit,
  ): Promise<BucketCount[]> {
    const rows = await this.userModel
      .aggregate<{ _id: Date; count: number }>([
        { $match: { [field]: { $type: "date" } } },
        {
          $group: {
            _id: { $dateTrunc: { date: `$${field}`, unit } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return rows.map((row) => ({ date: row._id, count: row.count }));
  }

  async groupByLoginProvider(): Promise<ProviderCount[]> {
    const rows = await this.userModel
      .aggregate<{ _id: LoginProvider; count: number }>([
        {
          $group: {
            _id: {
              $let: {
                vars: {
                  sub: { $toLower: { $ifNull: ["$auth0Sub", ""] } },
                },
                in: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $regexMatch: { input: "$$sub", regex: "google" },
                        },
                        then: "google",
                      },
                      {
                        case: {
                          $regexMatch: { input: "$$sub", regex: "discord" },
                        },
                        then: "discord",
                      },
                      {
                        case: {
                          $regexMatch: { input: "$$sub", regex: "^auth0\\|" },
                        },
                        then: "auth0",
                      },
                    ],
                    default: "other",
                  },
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])
      .exec();

    return rows.map((row) => ({ provider: row._id, count: row.count }));
  }

  /** Users grouped into mutually-exclusive recency buckets by `lastLogin`. */
  async engagementSegments(): Promise<KeyedCount<EngagementSegment>[]> {
    const now = Date.now();
    const d7 = new Date(now - 7 * DAY_MS);
    const d30 = new Date(now - 30 * DAY_MS);
    const d90 = new Date(now - 90 * DAY_MS);

    const rows = await this.userModel
      .aggregate<{ _id: EngagementSegment; count: number }>([
        { $match: { lastLogin: { $type: "date" } } },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $gte: ["$lastLogin", d7] }, then: "7d" },
                  { case: { $gte: ["$lastLogin", d30] }, then: "30d" },
                  { case: { $gte: ["$lastLogin", d90] }, then: "90d" },
                ],
                default: "dormant",
              },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    return rows.map((row) => ({ key: row._id, count: row.count }));
  }

  /** Users grouped into account-age buckets by `joined`. */
  async accountAgeSegments(): Promise<KeyedCount<AgeSegment>[]> {
    const now = Date.now();
    const d30 = new Date(now - 30 * DAY_MS);
    const d90 = new Date(now - 90 * DAY_MS);
    const d180 = new Date(now - 180 * DAY_MS);
    const d365 = new Date(now - 365 * DAY_MS);

    const rows = await this.userModel
      .aggregate<{ _id: AgeSegment; count: number }>([
        { $match: { joined: { $type: "date" } } },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $gte: ["$joined", d30] }, then: "lt1m" },
                  { case: { $gte: ["$joined", d90] }, then: "1to3m" },
                  { case: { $gte: ["$joined", d180] }, then: "3to6m" },
                  { case: { $gte: ["$joined", d365] }, then: "6to12m" },
                ],
                default: "gt1y",
              },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    return rows.map((row) => ({ key: row._id, count: row.count }));
  }

  async settingsDistributions(): Promise<SettingsDistributions> {
    const distinctStage = (field: string) => [
      {
        $group: {
          _id: { $ifNull: [`$settings.${field}`, "unset"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 as const } },
    ];

    const [result] = await this.userModel
      .aggregate<{
        theme: { _id: string; count: number }[];
        spriteSet: { _id: string; count: number }[];
        shinyUnlock: { _id: boolean; count: number }[];
      }>([
        {
          $facet: {
            theme: distinctStage("theme"),
            spriteSet: distinctStage("spriteSet"),
            shinyUnlock: [
              {
                $group: {
                  _id: { $ifNull: ["$settings.shinyUnlock", false] },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const toValueCounts = (rows: { _id: unknown; count: number }[]) =>
      rows.map((row) => ({ value: String(row._id), count: row.count }));

    return {
      theme: toValueCounts(result?.theme ?? []),
      spriteSet: toValueCounts(result?.spriteSet ?? []),
      shinyUnlock: (result?.shinyUnlock ?? []).map((row) => ({
        value: row._id ? "Unlocked" : "Locked",
        count: row.count,
      })),
    };
  }
}
