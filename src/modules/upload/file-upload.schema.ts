import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { UploadFolder } from "./upload-folder.enum";

export type FileUploadDocument = HydratedDocument<FileUploadEntity>;

@Schema({ timestamps: true, collection: "fileuploads" })
export class FileUploadEntity {
  @Prop({ required: true, index: true })
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

  @Prop()
  claimDeadline?: Date;

  createdAt!: Date;
}

export const FileUploadSchema = SchemaFactory.createForClass(FileUploadEntity);
FileUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
FileUploadSchema.index({ status: 1, claimDeadline: 1 });
