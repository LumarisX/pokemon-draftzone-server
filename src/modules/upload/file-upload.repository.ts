import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { FileUploadDocument, FileUploadEntity } from "./file-upload.schema";

@Injectable()
export class FileUploadRepository {
  constructor(
    @InjectModel(FileUploadEntity.name)
    private readonly fileUploadModel: Model<FileUploadDocument>,
  ) {}

  findOrphaned(olderThan: Date): Promise<FileUploadDocument[]> {
    return this.fileUploadModel
      .find({ status: "pending", createdAt: { $lt: olderThan } })
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
