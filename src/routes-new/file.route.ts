import z from "zod";
import { logger } from "../app";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { validateUploadRequest } from "../middleware/file-validation";
import FileUploadModel from "../models/file-upload.model";
import LeagueCoachesModel from "../models/league/coach.model";
import { s3Service } from "../services/s3.service";
import { createRoute } from "./route-builder";

export const FileRoute = createRoute()
  .auth()
  .use
  // Disable due to issues with blocking TOs
  // uploadRateLimiter,
  // checkUserStorageQuota,
  ()((r) => {
  r.path("league-upload").use(validateUploadRequest)((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({
            fileName: z.string(),
            contentType: z.string(),
          })
          .parse(data),
    })(async (ctx, req) => {
      if (!s3Service.isEnabled())
        throw new PDZError(ErrorCodes.FILE.SERVICE_UNAVAILABLE);
      const { fileName, contentType } = ctx.validatedQuery;
      if (!contentType.startsWith("image/"))
        throw new PDZError(ErrorCodes.FILE.INVALID_METADATA);
      const key = s3Service.generateFileKey(fileName, "league-uploads");
      await FileUploadModel.create({
        key,
        uploadedBy: ctx.sub,
        uploadType: "league-logo",
        fileName,
        fileSize: 0,
        contentType: contentType,
        status: "pending",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      const url = await s3Service.getPresignedUploadUrl(key, contentType, 120);
      logger.info(
        `Generated presigned URL for league upload: ${key} (user: ${ctx.sub})`,
      );
      return { url, key };
    });
  });
  r.path("team-upload").use(validateUploadRequest)((r) => {
    r.get.validate({
      query: (data) =>
        z
          .object({
            fileName: z.string(),
            contentType: z.string(),
          })
          .parse(data),
    })(async (ctx, req) => {
      if (!s3Service.isEnabled())
        throw new PDZError(ErrorCodes.FILE.SERVICE_UNAVAILABLE);
      const { fileName, contentType } = ctx.validatedQuery;
      if (!contentType.startsWith("image/"))
        throw new PDZError(ErrorCodes.FILE.INVALID_METADATA);
      const key = s3Service.generateFileKey(fileName, "team-uploads");
      await FileUploadModel.create({
        key,
        uploadedBy: ctx.sub,
        uploadType: "team-logo",
        fileName,
        fileSize: 0,
        contentType: contentType,
        status: "pending",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      const url = await s3Service.getPresignedUploadUrl(key, contentType, 120);
      logger.info(
        `Generated presigned URL for team upload: ${key} (user: ${ctx.sub})`,
      );
      return { url, key };
    });
  });
  r.path("confirm-upload")((r) => {
    r.post.validate({
      body: (data) =>
        z
          .object({
            fileKey: z.string().min(1),
            fileSize: z.number().optional(),
            contentType: z.string().optional(),
            relatedEntityId: z.string().optional(),
            tournamentId: z.string().optional(),
          })
          .parse(data),
    })(async (ctx) => {
      if (!s3Service.isEnabled())
        throw new PDZError(ErrorCodes.FILE.SERVICE_UNAVAILABLE);
      const { fileKey, fileSize, contentType, relatedEntityId, tournamentId } =
        ctx.validatedBody;
      const result = await s3Service.verifyFileExists(fileKey);
      if (!result.exists) {
        await FileUploadModel.findOneAndUpdate(
          { key: fileKey },
          { status: "deleted" },
        );
        throw new PDZError(ErrorCodes.FILE.NOT_FOUND);
      }

      const uploadRecord = await FileUploadModel.findOneAndUpdate(
        { key: fileKey, uploadedBy: ctx.sub },
        {
          status: "confirmed",
          fileSize: fileSize || result.size,
          relatedEntityId: relatedEntityId,
        },
        { new: true },
      );

      if (!uploadRecord) {
        logger.warn(
          `Upload record not found for key: ${fileKey} (user: ${ctx.sub})`,
        );
      }

      if (
        uploadRecord?.uploadType === "league-logo" &&
        relatedEntityId &&
        tournamentId
      ) {
        try {
          const user = await LeagueCoachesModel.findById(relatedEntityId);
          if (user) {
            user.logo = fileKey;
            await user.save();
            logger.info(
              `Updated LeagueCoaches ${relatedEntityId} signup for league ${tournamentId} with logo: ${fileKey}`,
            );
          } else {
            logger.warn(
              `Signup not found for league ${tournamentId} in LeagueCoaches ${relatedEntityId}`,
            );
          }
        } catch (updateError) {
          logger.warn(
            `Failed to update LeagueCoaches signup with logo: ${updateError}`,
          );
        }
      }

      logger.info(
        `Upload confirmed for file: ${fileKey} (${result.size} bytes, user: ${ctx.sub})`,
      );

      return {
        message: "Upload verified",
        size: result.size,
        key: fileKey,
      };
    });
  });
});
