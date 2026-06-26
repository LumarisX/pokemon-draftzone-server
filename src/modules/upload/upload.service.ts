import { S3Service } from "@core/storage/s3.service";
import { Injectable, Logger } from "@nestjs/common";
import { FileUploadRepository } from "./file-upload.repository";
import { PRESIGNED_UPLOAD_EXPIRY_SECONDS } from "./upload.constants";
import { RequestUploadUrlDto } from "./upload.dto";

export type PresignedUpload = {
  url: string;
  key: string;
  expiresIn: number;
};

export type UploadCleanupResult = {
  deletedOrphans: number;
  deletedOldRecords: number;
};

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const DELETED_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly fileUploadRepo: FileUploadRepository,
  ) {}

  async createPresignedUpload(
    dto: RequestUploadUrlDto,
    uploadedBy: string,
  ): Promise<PresignedUpload> {
    const key = this.s3Service.buildKey(dto.folder, dto.fileName);
    const url = await this.s3Service.getPresignedUploadUrl(
      key,
      dto.contentType,
      PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    );

    try {
      await this.fileUploadRepo.create({
        key,
        uploadedBy,
        uploadType: dto.folder,
        fileName: dto.fileName,
        contentType: dto.contentType,
      });
    } catch (error) {
      this.logger.warn(`Failed to record pending upload ${key}: ${error}`);
    }

    return { url, key, expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS };
  }

  async confirmUpload(key: string): Promise<void> {
    try {
      await this.fileUploadRepo.markConfirmed(key);
    } catch (error) {
      this.logger.warn(`Failed to confirm upload ${key}: ${error}`);
    }
  }

  async cleanupOrphanedUploads(): Promise<UploadCleanupResult> {
    const orphanedUploads = await this.fileUploadRepo.findOrphaned(
      new Date(Date.now() - ORPHAN_AGE_MS),
    );

    let deletedOrphans = 0;
    for (const upload of orphanedUploads) {
      if (this.s3Service.isEnabled()) {
        try {
          await this.s3Service.deleteObject(upload.key);
        } catch (error) {
          this.logger.warn(`Failed to delete S3 file ${upload.key}: ${error}`);
        }
      }
      await this.fileUploadRepo.deleteById(upload._id);
      deletedOrphans++;
    }

    const deletedOldRecords = await this.fileUploadRepo.deleteOldDeleted(
      new Date(Date.now() - DELETED_RECORD_RETENTION_MS),
    );

    return { deletedOrphans, deletedOldRecords };
  }
}
