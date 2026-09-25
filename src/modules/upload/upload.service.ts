import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { S3Service } from "@core/storage/s3.service";
import { Injectable, Logger } from "@nestjs/common";
import { FileUploadRepository } from "./file-upload.repository";
import { UploadFolder } from "./upload-folder.enum";
import {
  MAX_UPLOAD_BYTES,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  UNCLAIMED_UPLOAD_TTL_MS,
} from "./upload.constants";
import { RequestUploadUrlDto } from "./upload.dto";

export type PresignedUpload = {
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresIn: number;
  maxBytes: number;
};

export type UploadClaim = {
  uploadedBy: string;
  folder: UploadFolder;
  relatedEntityId?: string;
};

export type UploadCleanupResult = {
  deletedOrphans: number;
  deletedOldRecords: number;
};

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
    const post = await this.s3Service.getPresignedUploadPost(
      key,
      dto.contentType,
      MAX_UPLOAD_BYTES,
      PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    );

    await this.fileUploadRepo.create({
      key,
      uploadedBy,
      uploadType: dto.folder,
      fileName: dto.fileName,
      contentType: dto.contentType,
      claimDeadline: new Date(Date.now() + UNCLAIMED_UPLOAD_TTL_MS),
    });

    return {
      url: post.url,
      fields: post.fields,
      key,
      expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  async claimUpload(key: string, claim: UploadClaim): Promise<void> {
    const upload = await this.fileUploadRepo.findByKey(key);
    if (
      !upload ||
      upload.status === "deleted" ||
      upload.uploadedBy !== claim.uploadedBy ||
      upload.uploadType !== claim.folder
    )
      throw new PDZError(ErrorCodes.FILE.NOT_FOUND);

    let fileSize: number | undefined;
    if (this.s3Service.isEnabled()) {
      const head = await this.s3Service.headObject(key);
      if (!head.exists) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
      if (head.size !== undefined && head.size > MAX_UPLOAD_BYTES)
        throw new PDZError(ErrorCodes.FILE.TOO_LARGE);
      fileSize = head.size;
    }

    const confirmed = await this.fileUploadRepo.markConfirmed(key, {
      fileSize,
      relatedEntityId: claim.relatedEntityId,
    });
    if (!confirmed) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
  }

  async cleanupOrphanedUploads(): Promise<UploadCleanupResult> {
    const orphanedUploads = await this.fileUploadRepo.findOrphaned(new Date());

    let deletedOrphans = 0;
    for (const upload of orphanedUploads) {
      if (this.s3Service.isEnabled()) {
        try {
          await this.s3Service.deleteObject(upload.key);
        } catch (error) {
          this.logger.warn(`Failed to delete S3 file ${upload.key}: ${error}`);
          continue;
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
