import { Injectable } from "@nestjs/common";
import {
  AdminRepository,
  AgeSegment,
  BucketCount,
  BucketUnit,
  EngagementSegment,
  KeyedCount,
  ProviderCount,
  SettingsDistributions,
} from "./admin.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UserStatsSummary {
  totalUsers: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  activeUsersLast90Days: number;
  generatedAt: Date;
}

export interface UserTimeSeries {
  bucket: BucketUnit;
  joined: BucketCount[];
  cumulative: BucketCount[];
  lastLogin: BucketCount[];
}

@Injectable()
export class AdminService {
  constructor(private readonly adminRepository: AdminRepository) {}

  async getSummary(): Promise<UserStatsSummary> {
    const now = Date.now();
    const since = (days: number) => new Date(now - days * DAY_MS);

    const [
      totalUsers,
      newUsersLast7Days,
      newUsersLast30Days,
      activeUsersLast7Days,
      activeUsersLast30Days,
      activeUsersLast90Days,
    ] = await Promise.all([
      this.adminRepository.countUsers(),
      this.adminRepository.countSince("joined", since(7)),
      this.adminRepository.countSince("joined", since(30)),
      this.adminRepository.countSince("lastLogin", since(7)),
      this.adminRepository.countSince("lastLogin", since(30)),
      this.adminRepository.countSince("lastLogin", since(90)),
    ]);

    return {
      totalUsers,
      newUsersLast7Days,
      newUsersLast30Days,
      activeUsersLast7Days,
      activeUsersLast30Days,
      activeUsersLast90Days,
      generatedAt: new Date(now),
    };
  }

  getLoginProviders(): Promise<ProviderCount[]> {
    return this.adminRepository.groupByLoginProvider();
  }

  async getEngagement(): Promise<KeyedCount<EngagementSegment>[]> {
    const order: EngagementSegment[] = ["7d", "30d", "90d", "dormant"];
    return orderAndFill(await this.adminRepository.engagementSegments(), order);
  }

  async getAccountAge(): Promise<KeyedCount<AgeSegment>[]> {
    const order: AgeSegment[] = ["lt1m", "1to3m", "3to6m", "6to12m", "gt1y"];
    return orderAndFill(await this.adminRepository.accountAgeSegments(), order);
  }

  getSettingsDistributions(): Promise<SettingsDistributions> {
    return this.adminRepository.settingsDistributions();
  }

  async getTimeSeries(bucket: BucketUnit): Promise<UserTimeSeries> {
    const [joinedRaw, lastLoginRaw] = await Promise.all([
      this.adminRepository.bucketByDate("joined", bucket),
      this.adminRepository.bucketByDate("lastLogin", bucket),
    ]);

    const joined = fillGaps(joinedRaw, bucket);
    const lastLogin = fillGaps(lastLoginRaw, bucket);

    let total = 0;
    const cumulative = joined.map(({ date, count }) => {
      total += count;
      return { date, count: total };
    });

    return { bucket, joined, cumulative, lastLogin };
  }
}

/** Returns counts in canonical order, inserting zeros for absent keys. */
function orderAndFill<K extends string>(
  rows: KeyedCount<K>[],
  order: K[],
): KeyedCount<K>[] {
  const byKey = new Map(rows.map((r) => [r.key, r.count]));
  return order.map((key) => ({ key, count: byKey.get(key) ?? 0 }));
}

function nextBucket(date: Date, unit: BucketUnit): Date {
  const d = new Date(date);
  if (unit === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (unit === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function fillGaps(rows: BucketCount[], unit: BucketUnit): BucketCount[] {
  if (rows.length <= 1) return rows;

  const byTime = new Map(rows.map((r) => [r.date.getTime(), r.count]));
  const end = rows[rows.length - 1].date.getTime();
  const filled: BucketCount[] = [];

  let cursor = new Date(rows[0].date);
  let guard = 0;
  while (cursor.getTime() <= end && guard++ < 100_000) {
    filled.push({
      date: new Date(cursor),
      count: byTime.get(cursor.getTime()) ?? 0,
    });
    cursor = nextBucket(cursor, unit);
  }
  return filled;
}
