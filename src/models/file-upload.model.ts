import { HydratedDocument, model, Schema } from "mongoose";

export const FILE_UPLOAD_COLLECTION = "FileUpload";

export type FileUpload = {
  key: string;
  uploadedBy: string;
  uploadType: "league-logo" | "team-logo" | "other";
  fileName: string;
  fileSize: number;
  contentType: string;
  status: "pending" | "confirmed" | "deleted";
  ipAddress?: string;
  userAgent?: string;
  relatedEntityId?: string;
  deletedAt?: Date;
};

export type FileUploadDocument = HydratedDocument<FileUpload>;

const FileUploadSchema: Schema<FileUpload> = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    uploadedBy: { type: String, required: true, index: true },
    uploadType: {
      type: String,
      enum: ["league-logo", "team-logo", "other"],
      required: true,
    },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    contentType: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "deleted"],
      default: "pending",
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    relatedEntityId: { type: String, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

FileUploadSchema.index({ uploadedBy: 1, createdAt: -1 });

export default model<FileUpload>(FILE_UPLOAD_COLLECTION, FileUploadSchema);
