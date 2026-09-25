import { S3Service } from "@core/storage/s3.service";
import { Types } from "mongoose";
import { FileUploadRepository } from "./file-upload.repository";
import { RequestUploadUrlDto } from "./upload.dto";
import { UploadFolder } from "./upload-folder.enum";
import {
  MAX_UPLOAD_BYTES,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
} from "./upload.constants";
import { UploadsService } from "./upload.service";

function buildOrphan(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    key: "team-logos/some-file.png",
    status: "pending",
    ...overrides,
  } as any;
}

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    key: "team-logos/logo.png",
    uploadedBy: "auth0|user-1",
    uploadType: UploadFolder.TEAM_LOGOS,
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
      getPresignedUploadPost: jest.fn(),
      isEnabled: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;
    fileUploadRepo = {
      create: jest.fn(),
      findByKey: jest.fn(),
      markConfirmed: jest.fn().mockResolvedValue(true),
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
      jest.useFakeTimers().setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
      s3Service.buildKey.mockReturnValue("team-logos/logo.png");
      s3Service.getPresignedUploadPost.mockResolvedValue({
        url: "https://s3.example.com/",
        fields: { key: "team-logos/logo.png" },
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("signs a size-capped POST for the built key", async () => {
      const result = await service.createPresignedUpload(dto, "auth0|user-1");

      expect(s3Service.buildKey).toHaveBeenCalledWith(
        UploadFolder.TEAM_LOGOS,
        "logo.png",
      );
      expect(s3Service.getPresignedUploadPost).toHaveBeenCalledWith(
        "team-logos/logo.png",
        "image/png",
        MAX_UPLOAD_BYTES,
        PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      );
      expect(result).toEqual({
        url: "https://s3.example.com/",
        fields: { key: "team-logos/logo.png" },
        key: "team-logos/logo.png",
        expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        maxBytes: MAX_UPLOAD_BYTES,
      });
    });

    it("records a pending upload that must be claimed within a day", async () => {
      await service.createPresignedUpload(dto, "auth0|user-1");

      expect(fileUploadRepo.create).toHaveBeenCalledWith({
        key: "team-logos/logo.png",
        uploadedBy: "auth0|user-1",
        uploadType: UploadFolder.TEAM_LOGOS,
        fileName: "logo.png",
        contentType: "image/png",
        claimDeadline: new Date("2026-03-02T00:00:00.000Z"),
      });
    });

    it("fails when the upload can't be recorded, since it could never be claimed", async () => {
      fileUploadRepo.create.mockRejectedValue(new Error("Mongo unavailable"));

      await expect(
        service.createPresignedUpload(dto, "auth0|user-1"),
      ).rejects.toThrow("Mongo unavailable");
    });
  });

  describe("claimUpload", () => {
    const claim = {
      uploadedBy: "auth0|user-1",
      folder: UploadFolder.TEAM_LOGOS,
      relatedEntityId: "team-1",
    };

    beforeEach(() => {
      s3Service.isEnabled.mockReturnValue(true);
      s3Service.headObject.mockResolvedValue({ exists: true, size: 2048 });
    });

    it("confirms the uploader's own file with its size and entity", async () => {
      fileUploadRepo.findByKey.mockResolvedValue(buildRecord());

      await service.claimUpload("team-logos/logo.png", claim);

      expect(fileUploadRepo.markConfirmed).toHaveBeenCalledWith(
        "team-logos/logo.png",
        { fileSize: 2048, relatedEntityId: "team-1" },
      );
    });

    it("lets the uploader reuse a file they already claimed", async () => {
      fileUploadRepo.findByKey.mockResolvedValue(
        buildRecord({ status: "confirmed" }),
      );

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).resolves.toBeUndefined();
    });

    it.each([
      ["has no upload record", null],
      ["was uploaded by someone else", buildRecord({ uploadedBy: "auth0|other" })],
      [
        "was uploaded to another folder",
        buildRecord({ uploadType: UploadFolder.TOURNAMENT_LOGOS }),
      ],
      ["was deleted", buildRecord({ status: "deleted" })],
    ])("refuses a key that %s", async (_, record) => {
      fileUploadRepo.findByKey.mockResolvedValue(record);

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).rejects.toMatchObject({ code: "FILE-003" });
      expect(fileUploadRepo.markConfirmed).not.toHaveBeenCalled();
    });

    it("refuses a key whose object never reached S3", async () => {
      fileUploadRepo.findByKey.mockResolvedValue(buildRecord());
      s3Service.headObject.mockResolvedValue({ exists: false });

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).rejects.toMatchObject({ code: "FILE-003" });
    });

    it("refuses an object over the size cap", async () => {
      fileUploadRepo.findByKey.mockResolvedValue(buildRecord());
      s3Service.headObject.mockResolvedValue({
        exists: true,
        size: MAX_UPLOAD_BYTES + 1,
      });

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).rejects.toMatchObject({ code: "FILE-004" });
      expect(fileUploadRepo.markConfirmed).not.toHaveBeenCalled();
    });

    it("still checks ownership when S3 is disabled", async () => {
      s3Service.isEnabled.mockReturnValue(false);
      fileUploadRepo.findByKey.mockResolvedValue(
        buildRecord({ uploadedBy: "auth0|other" }),
      );

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).rejects.toMatchObject({ code: "FILE-003" });
      expect(s3Service.headObject).not.toHaveBeenCalled();
    });

    it("refuses when the record changed before it could be confirmed", async () => {
      fileUploadRepo.findByKey.mockResolvedValue(buildRecord());
      fileUploadRepo.markConfirmed.mockResolvedValue(false);

      await expect(
        service.claimUpload("team-logos/logo.png", claim),
      ).rejects.toMatchObject({ code: "FILE-003" });
    });
  });

  describe("cleanupOrphanedUploads", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("looks up unclaimed uploads past their claim deadline", async () => {
      fileUploadRepo.findOrphaned.mockResolvedValue([]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);

      await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.findOrphaned).toHaveBeenCalledWith(
        new Date("2026-03-01T00:00:00.000Z"),
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

    it("keeps the record for a retry when the S3 delete throws", async () => {
      const orphan = buildOrphan();
      fileUploadRepo.findOrphaned.mockResolvedValue([orphan]);
      fileUploadRepo.deleteOldDeleted.mockResolvedValue(0);
      s3Service.isEnabled.mockReturnValue(true);
      s3Service.deleteObject.mockRejectedValue(new Error("S3 unavailable"));

      const result = await service.cleanupOrphanedUploads();

      expect(fileUploadRepo.deleteById).not.toHaveBeenCalled();
      expect(result.deletedOrphans).toBe(0);
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
