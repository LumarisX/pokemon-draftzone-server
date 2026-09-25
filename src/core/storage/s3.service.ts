import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";

export type S3ObjectMetadata = {
  exists: boolean;
  size?: number;
  contentType?: string;
};

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
};

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 120;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 300;

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client?: S3Client;
  private bucket?: string;
  private region?: string;
  private publicBaseUrl?: string;
  private configured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const region = this.configService.get<string>("AWS_REGION");
    const bucket = this.configService.get<string>("AWS_S3_BUCKET");
    const accessKeyId = this.configService.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>(
      "AWS_SECRET_ACCESS_KEY",
    );
    this.publicBaseUrl = this.configService.get<string>(
      "AWS_S3_PUBLIC_BASE_URL",
    );

    if (!region || !bucket) {
      this.logger.warn(
        "S3 storage is not configured (missing AWS_REGION / AWS_S3_BUCKET). Upload features will be disabled.",
      );
      return;
    }

    this.client =
      accessKeyId && secretAccessKey
        ? new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })
        : new S3Client({ region });

    this.bucket = bucket;
    this.region = region;
    this.configured = true;

    this.logger.log(
      `S3 storage configured for bucket "${bucket}" (${region}) using ${
        accessKeyId ? "explicit credentials" : "default credential chain"
      }.`,
    );
  }

  isEnabled(): boolean {
    return this.configured;
  }

  private assertConfigured(): { client: S3Client; bucket: string } {
    if (!this.configured || !this.client || !this.bucket) {
      throw new PDZError(ErrorCodes.FILE.SERVICE_UNAVAILABLE);
    }
    return { client: this.client, bucket: this.bucket };
  }

  buildKey(folder: string, fileName: string): string {
    const sanitized = fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_")
      .slice(-100);
    return `${folder}/${randomUUID()}-${sanitized}`;
  }

  async getPresignedUploadPost(
    key: string,
    contentType: string,
    maxBytes: number,
    expiresInSeconds: number = DEFAULT_UPLOAD_EXPIRY_SECONDS,
  ): Promise<PresignedPost> {
    const { client, bucket } = this.assertConfigured();
    return createPresignedPost(client, {
      Bucket: bucket,
      Key: key,
      Fields: { "Content-Type": contentType },
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", contentType],
      ],
      Expires: expiresInSeconds,
    });
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_DOWNLOAD_EXPIRY_SECONDS,
  ): Promise<string> {
    const { client, bucket } = this.assertConfigured();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async headObject(key: string): Promise<S3ObjectMetadata> {
    const { client, bucket } = this.assertConfigured();
    try {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        exists: true,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error: any) {
      if (
        error?.name === "NotFound" ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.assertConfigured();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { client, bucket } = this.assertConfigured();
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  getPublicUrl(key: string): string {
    const { bucket } = this.assertConfigured();
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
    }
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
