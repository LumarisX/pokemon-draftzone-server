import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  AdminAuditAction,
  AdminAuditDocument,
  AdminAuditEntity,
} from "./admin-audit.schema";

export type NewAdminAudit = {
  actor: string;
  action: AdminAuditAction;
  target: string;
  details?: Record<string, unknown>;
};

export type StoredAdminAudit = {
  id: string;
  target: string;
  details: Record<string, unknown>;
};

const OPEN_TRANSFER_LIMIT = 20;

@Injectable()
export class AdminAuditRepository {
  constructor(
    @InjectModel(AdminAuditEntity.name)
    private readonly auditModel: Model<AdminAuditDocument>,
  ) {}

  async append(entry: NewAdminAudit): Promise<string> {
    const created = await this.auditModel.create(entry);
    return String(created._id);
  }

  async patchDetails(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const set = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [`details.${key}`, value]),
    );
    await this.auditModel
      .updateOne({ _id: { $eq: id } }, { $set: set })
      .exec();
  }

  async findOpenTransfers(target: string): Promise<StoredAdminAudit[]> {
    const docs = await this.auditModel
      .find({
        target: { $eq: target },
        action: "account.transfer",
        "details.undoneAt": { $exists: false },
        "details.state": { $ne: "failed" },
      })
      .sort({ createdAt: -1 })
      .limit(OPEN_TRANSFER_LIMIT)
      .exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      target: doc.target,
      details: doc.details ?? {},
    }));
  }
}
