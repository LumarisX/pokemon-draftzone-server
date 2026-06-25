import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type FileUploadDocument = HydratedDocument<FileUploadEntity>;

@Schema({ timestamps: true, collection: "fileuploads" })
export class FileUploadEntity {
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  uploadedBy!: string;

  @Prop({
    type: String,
    enum: ["league-logo", "team-logo", "other"],
    required: true,
  })
  uploadType!: "league-logo" | "team-logo" | "other";

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileSize!: number;

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
