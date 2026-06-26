import { S3Service } from "@core/storage/s3.service";
import { Types } from "mongoose";
import { FileUploadRepository } from "./file-upload.repository";
import { RequestUploadUrlDto } from "./upload.dto";
import { UploadFolder } from "./upload-folder.enum";
import { PRESIGNED_UPLOAD_EXPIRY_SECONDS } from "./upload.constants";
import { UploadsService } from "./upload.service";

function buildOrphan(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    key: "team-logos/some-file.png",
    status: "pending",
    ...overrides,
  } as any;
}

describe("UploadsService", () => {
  let s3Service: jest.Mocked<S3Service>;
  let fileUploadRepo: jest.Mocked<FileUploadRepository>;
  let service: UploadsService;

  beforeEach(() => {
    s3Service = {
      buildKey: jest.fn(),
      getPresignedUploadUrl: jest.fn(),
      isEnabled: jest.fn(),
      deleteObject: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;
    fileUploadRepo = {
      create: jest.fn(),
      markConfirmed: jest.fn(),
      findOrphaned: jest.fn(),
      deleteById: jest.fn(),
      deleteOldDeleted: jest.fn(),
    } as unknown as jest.Mocked<FileUploadRepository>;
    service = new UploadsService(s3Service, fileUploadRepo);
  });

  describe("createPresignedUpload", () => {
    const dto: RequestUploadUrlDto = {
      folder: UploadFolder.TEAM_LOGOS,
      fileName: "logo.png",
      contentType: "image/png",
    };

    beforeEach(() => {
      s3Service.buildKey.mockReturnValue("team-logos/logo.png");
      s3Service.getPresignedUploadUrl.mockResolvedValue("https://s3.example.com/presigned");
    });

    it("builds the key, requests a presigned URL, and returns the expiry", async () => {
      const result = await service.createPresignedUpload(dto, "auth0|user-1");

      expect(s3Service.buildKey).toHaveBeenCalledWith(UploadFolder.TEAM_LOGOS, "logo.png");
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
        "team-logos/logo.png",
        "image/png",
        PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      );
      expect(result).toEqual({
        url: "https://s3.example.com/presigned",
        key: "team-logos/logo.png",
        expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      });
    });

    it("records a pending upload for the key, owner, and upload type", async () => {
      await service.createPresignedUpload(dto, "auth0|user-1");

      expect(fileUploadRepo.create).toHaveBeenCalledWith({
        key: "team-logos/logo.png",
        uploadedBy: "auth0|user-1",
        uploadType: UploadFolder.TEAM_LOGOS,
        fileName: "logo.png",
        contentType: "image/png",
      });
    });

    it("still returns the presigned URL when recording the upload fails", async () => {
      fileUploadRepo.create.mockRejectedValue(new Error("Mongo unavailable"));

      const result = await service.createPresignedUpload(dto, "auth0|user-1");

      expect(result.url).toBe("https://s3.example.com/presigned");
    });
  });

  describe("confirmUpload", () => {
    it("delegates to the repository", async () => {
      await service.confirmUpload("team-logos/logo.png");

      expect(fileUploadRepo.markConfirmed).toHaveBeenCalledWith("team-logos/logo.png");
    });

    it("doesn't throw when the repository call fails", async () => {
      fileUploadRepo.markConfirmed.mockRejectedValue(new Error("Mongo unavailable"));

      await expect(service.confirmUpload("team-logos/logo.png")).resolves.toBeUndefined();
    });
  });

  describe("cleanupOrphanedUploads", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("looks up orphans older than 24 hours", async () => {
      fileUploadRepo.findOrphaned.mockResolvedValue([]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);

      await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.findOrphaned).toHaveBeenCalledWith(
        new Date("2026-02-28T00:00:00.000Z"),
      );
    });

    it("looks up old deleted records older than 30 days", async () => {
      fileUploadRepo.findOrphaned.mockResolvedValue([]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);

      await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.deleteOldDeleted).toHaveBeenCalledWith(
        new Date("2026-01-30T00:00:00.000Z"),
      );
    });

    it("deletes the S3 object and the DB record for each orphan when S3 is enabled", async () => {
      const orphan = buildOrphan({ key: "team-logos/a.png" });
      fileUploadRepo.findOrphaned.mockResolvedValue([orphan]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);
      s3Service.isEnabled.mockReturnValue(true);

      const result = await service.cleanupOrphanedUploads();

      expect(s3Service.deleteObject).toHaveBeenCalledWith("team-logos/a.png");
      expect(fileUploadRepo.deleteById).toHaveBeenCalledWith(orphan._id);
      expect(result.deletedOrphans).toBe(1);
    });

    it("skips the S3 delete (but still deletes the DB record) when S3 is disabled", async () => {
      const orphan = buildOrphan();
      fileUploadRepo.findOrphaned.mockResolvedValue([orphan]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);
      s3Service.isEnabled.mockReturnValue(false);

      const result = await service.cleanupOrphanedUploads();

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(fileUploadRepo.deleteById).toHaveBeenCalledWith(orphan._id);
      expect(result.deletedOrphans).toBe(1);
    });

    it("still deletes the DB record (and counts the orphan) when the S3 delete throws", async () => {
      const orphan = buildOrphan();
      fileUploadRepo.findOrphaned.mockResolvedValue([orphan]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);
      s3Service.isEnabled.mockReturnValue(true);
      s3Service.deleteObject.mockRejectedValue(new Error("S3 unavailable"));

      const result = await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.deleteById).toHaveBeenCalledWith(orphan._id);
      expect(result.deletedOrphans).toBe(1);
    });

    it("processes every orphan and reports both counts together", async () => {
      const orphans = [buildOrphan(), buildOrphan(), buildOrphan()];
      fileUploadRepo.findOrphaned.mockResolvedValue(orphans);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(5);
      s3Service.isEnabled.mockReturnValue(true);

      const result = await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.deleteById).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ deletedOrphans: 3, deletedOldRecords: 5 });
    });

    it("reports zero orphans deleted when there are none to clean up", async () => {
      fileUploadRepo.findOrphaned.mockResolvedValue([]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);

      const result = await service.cleanupOrphanedUploads();

      expect(result).toEqual({ deletedOrphans: 0, deletedOldRecords: 0 });
    });
  });
});
