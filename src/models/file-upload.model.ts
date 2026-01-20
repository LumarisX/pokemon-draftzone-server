import mongoose, { Schema, Document, Types } from "mongoose";

export const FILE_UPLOAD_COLLECTION = "FileUpload";

export type FileUpload = {
  key: string; // S3 key (path in bucket)
  uploadedBy: string; // Auth0 user ID
  uploadType: "league-logo" | "team-logo" | "other";
  fileName: string; // Original file name
  fileSize: number; // Size in bytes
  contentType: string; // MIME type
  status: "pending" | "confirmed" | "deleted";
  ipAddress?: string; // For additional tracking
  userAgent?: string; // Browser/client info
  relatedEntityId?: string; // League ID or Team ID if applicable
  deletedAt?: Date;
};

export type FileUploadDocument = Document &
  FileUpload & { _id: Types.ObjectId };

const FileUploadSchema: Schema<FileUploadDocument> = new Schema(
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

// Index for rate limiting queries
FileUploadSchema.index({ uploadedBy: 1, createdAt: -1 });

export default mongoose.model<FileUploadDocument>(
  FILE_UPLOAD_COLLECTION,
  FileUploadSchema,
);
