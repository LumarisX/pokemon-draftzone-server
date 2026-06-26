import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { UploadFolder } from "./upload-folder.enum";

export type FileUploadDocument = HydratedDocument<FileUploadEntity>;

@Schema({ timestamps: true, collection: "fileuploads" })
export class FileUploadEntity {
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  uploadedBy!: string;

  @Prop({
    type: String,
    enum: Object.values(UploadFolder),
    required: true,
  })
  uploadType!: UploadFolder;

  @Prop({ required: true })
  fileName!: string;

  // Unknown until the client finishes uploading directly to S3 - the
  // presigned-URL request that creates this record happens beforehand.
  @Prop()
  fileSize?: number;

  @Prop({ required: true })
  contentType!: string;

  @Prop({
    type: String,
    enum: ["pending", "confirmed", "deleted"],
    default: "pending",
  })
  status!: "pending" | "confirmed" | "deleted";

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ index: true })
  relatedEntityId?: string;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
}

export const FileUploadSchema = SchemaFactory.createForClass(FileUploadEntity);
FileUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
