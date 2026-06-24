import { S3Service } from "@core/storage/s3.service";
import { Injectable } from "@nestjs/common";
import { PRESIGNED_UPLOAD_EXPIRY_SECONDS } from "./uploads.constants";
import { RequestUploadUrlDto } from "./uploads.dto";

export type PresignedUpload = {
  url: string;
  key: string;
  expiresIn: number;
};

@Injectable()
export class UploadsService {
  constructor(private readonly s3Service: S3Service) {}

  async createPresignedUpload(
    dto: RequestUploadUrlDto,
  ): Promise<PresignedUpload> {
    const key = this.s3Service.buildKey(dto.folder, dto.fileName);
    const url = await this.s3Service.getPresignedUploadUrl(
      key,
      dto.contentType,
      PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    );
    return { url, key, expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS };
  }
}
