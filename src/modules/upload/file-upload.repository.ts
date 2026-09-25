import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { FileUploadDocument, FileUploadEntity } from "./file-upload.schema";
import { UploadFolder } from "./upload-folder.enum";

export type CreateFileUploadInput = {
  key: string;
  uploadedBy: string;
  uploadType: UploadFolder;
  fileName: string;
  contentType: string;
  claimDeadline: Date;
};

@Injectable()
export class FileUploadRepository {
  constructor(
    @InjectModel(FileUploadEntity.name)
    private readonly fileUploadModel: Model<FileUploadDocument>,
  ) {}

  async create(data: CreateFileUploadInput): Promise<FileUploadDocument> {
    const doc = new this.fileUploadModel(data);
    await doc.save();
    return doc;
  }

  findByKey(key: string): Promise<FileUploadDocument | null> {
    return this.fileUploadModel.findOne({ key: { $eq: key } }).exec();
  }

  async markConfirmed(
    key: string,
    details: { fileSize?: number; relatedEntityId?: string },
  ): Promise<boolean> {
    const set: Record<string, unknown> = { status: "confirmed" };
    if (details.fileSize !== undefined) set["fileSize"] = details.fileSize;
    if (details.relatedEntityId !== undefined)
      set["relatedEntityId"] = details.relatedEntityId;
    const result = await this.fileUploadModel
      .updateOne(
        { key: { $eq: key }, status: { $in: ["pending", "confirmed"] } },
        { $set: set, $unset: { claimDeadline: 1 } },
      )
      .exec();
    return result.matchedCount > 0;
  }

  findOrphaned(now: Date): Promise<FileUploadDocument[]> {
    return this.fileUploadModel
      .find({ status: "pending", claimDeadline: { $lt: now } })
      .exec();
  }

  async deleteById(id: Types.ObjectId | string): Promise<void> {
    await this.fileUploadModel.deleteOne({ _id: id }).exec();
  }

  async deleteOldDeleted(olderThan: Date): Promise<number> {
    const result = await this.fileUploadModel
      .deleteMany({ status: "deleted", deletedAt: { $lt: olderThan } })
      .exec();
    return result.deletedCount ?? 0;
  }
}
