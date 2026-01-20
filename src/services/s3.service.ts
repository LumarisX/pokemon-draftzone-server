import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";

class S3Service {
  private s3Client: S3Client | null = null;
  private bucket: string | null = null;
  private region: string | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeS3Client();
  }

  private initializeS3Client() {
    const accessKeyId = config.AWS_ACCESS_KEY_ID;
    const secretAccessKey = config.AWS_SECRET_ACCESS_KEY;
    const region = config.AWS_REGION;
    const bucket = config.AWS_S3_BUCKET;

    if (!region || !bucket) {
      console.warn(
        "AWS S3 configuration is incomplete. File upload functionality will be disabled.",
      );
      console.warn("Required environment variables: AWS_REGION, AWS_S3_BUCKET");
      return;
    }

    // If both keys are provided, use explicit credentials (for local dev)
    // Otherwise, use default credential provider chain (for EC2 IAM role)
    const clientConfig: any = { region };

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
      console.info(
        `S3 Service initialized with access keys for bucket: ${bucket}`,
      );
    } else {
      console.info(
        `S3 Service initialized using default credential chain (IAM role) for bucket: ${bucket}`,
      );
    }

    this.s3Client = new S3Client(clientConfig);
    this.bucket = bucket;
    this.region = region;
    this.isConfigured = true;
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
    maxFileSize: number = 5 * 1024 * 1024, // 5MB default
  ): Promise<string> {
    if (!this.isConfigured || !this.s3Client || !this.bucket) {
      throw new Error("S3 service is not configured");
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    // Add security constraints to presigned URL
    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn,
      // Conditions enforce upload constraints on AWS side
      signableHeaders: new Set(["content-type", "content-length"]),
    });

    return presignedUrl;
  }

  async verifyFileExists(
    key: string,
  ): Promise<{ exists: boolean; size?: number }> {
    if (!this.isConfigured || !this.s3Client || !this.bucket) {
      throw new Error("S3 service is not configured");
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);
      return { exists: true, size: response.ContentLength };
    } catch (error) {
      return { exists: false };
    }
  }

  generateFileKey(filename: string, folder: string = "league-uploads"): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${folder}/${timestamp}-${sanitizedFilename}`;
  }

  getPublicUrl(key: string): string {
    if (!this.isConfigured || !this.bucket || !this.region) {
      throw new Error("S3 service is not configured");
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }
}

export const s3Service = new S3Service();
