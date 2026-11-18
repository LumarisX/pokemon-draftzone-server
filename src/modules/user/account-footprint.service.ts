import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { ACCOUNT_FOOTPRINT } from "./account-footprint.table";

export interface FootprintEntry {
  collection: string;
  count: number;
}

export function isEmptyFootprint(footprint: readonly FootprintEntry[]): boolean {
  return footprint.every((entry) => entry.count === 0);
}

@Injectable()
export class AccountFootprintService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async footprint(accountId: string): Promise<FootprintEntry[]> {
    return Promise.all(
      ACCOUNT_FOOTPRINT.map(async ({ collection, fields }) => ({
        collection,
        count: await this.connection.collection(collection).countDocuments({
          $or: fields.map((field) => ({ [field]: { $eq: accountId } })),
        }),
      })),
    );
  }

  async isEmpty(accountId: string): Promise<boolean> {
    return isEmptyFootprint(await this.footprint(accountId));
  }
}
