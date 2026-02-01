import { Request, Response } from "express";
import { RouteOld, sendError } from "./index";
import { s3Service } from "../services/s3.service";
import { logger } from "../app";
import { jwtCheck } from "../middleware/jwtcheck";
import { validateUploadRequest } from "../middleware/file-validation";
import {
  uploadRateLimiter,
  checkUserStorageQuota,
} from "../middleware/upload-rate-limiter";
import FileUploadModel from "../models/file-upload.model";
import LeagueUserModel from "../models/league/coach.model";

export const FileRoutes: RouteOld = {
  middleware: [jwtCheck, uploadRateLimiter, checkUserStorageQuota],
  subpaths: {
    "/league-upload": {
      middleware: [validateUploadRequest],
      get: async (req: Request, res: Response) => {
        try {
          if (!s3Service.isEnabled()) {
            return res.status(503).json({
              error: "File upload service is not configured",
            });
          }

          const userId = req.auth?.payload?.sub;
          const { fileName, contentType } = req.query;

          if (
            !fileName ||
            typeof fileName !== "string" ||
            typeof contentType !== "string" ||
            !contentType.startsWith("image/")
          ) {
            return res.status(400).json({ error: "Invalid file metadata" });
          }

          const key = s3Service.generateFileKey(fileName, "league-uploads");

          // Create database record for tracking
          await FileUploadModel.create({
            key,
            uploadedBy: userId,
            uploadType: "league-logo",
            fileName,
            fileSize: 0, // Will be updated on confirmation
            contentType: contentType,
            status: "pending",
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          });

          // Get presigned URL (expires in 2 minutes)
          const url = await s3Service.getPresignedUploadUrl(
            key,
            contentType,
            120,
          );

          logger.info(
            `Generated presigned URL for league upload: ${key} (user: ${userId})`,
          );

          return res.json({ url, key });
        } catch (error) {
          logger.error("Error generating presigned URL:", error);
          return res
            .status(500)
            .json({ error: "Error generating pre-signed URL" });
        }
      },
    },
    "/team-upload": {
      middleware: [validateUploadRequest],
      get: async (req: Request, res: Response) => {
        try {
          if (!s3Service.isEnabled()) {
            return res.status(503).json({
              error: "File upload service is not configured",
            });
          }

          const userId = req.auth?.payload?.sub;
          const { fileName, contentType } = req.query;

          if (
            !fileName ||
            typeof fileName !== "string" ||
            typeof contentType !== "string" ||
            !contentType.startsWith("image/")
          ) {
            return res.status(400).json({ error: "Invalid file metadata" });
          }

          const key = s3Service.generateFileKey(fileName, "team-uploads");

          // Create database record for tracking
          await FileUploadModel.create({
            key,
            uploadedBy: userId,
            uploadType: "team-logo",
            fileName,
            fileSize: 0, // Will be updated on confirmation
            contentType: contentType,
            status: "pending",
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          });

          // Get presigned URL (expires in 2 minutes)
          const url = await s3Service.getPresignedUploadUrl(
            key,
            contentType,
            120,
          );

          logger.info(
            `Generated presigned URL for team upload: ${key} (user: ${userId})`,
          );

          return res.json({ url, key });
        } catch (error) {
          logger.error("Error generating presigned URL:", error);
          return res
            .status(500)
            .json({ error: "Error generating pre-signed URL" });
        }
      },
    },
    "/confirm-upload": {
      post: async (req: Request, res: Response) => {
        try {
          if (!s3Service.isEnabled()) {
            return res.status(503).json({
              error: "File upload service is not configured",
            });
          }

          const userId = req.auth?.payload?.sub;
          const { fileKey, fileSize, contentType, relatedEntityId, leagueId } =
            req.body;

          if (!fileKey || typeof fileKey !== "string") {
            return res.status(400).json({ error: "File key is required" });
          }

          // Verify file exists in S3
          const result = await s3Service.verifyFileExists(fileKey);

          if (!result.exists) {
            // Mark as failed in database
            await FileUploadModel.findOneAndUpdate(
              { key: fileKey },
              { status: "deleted" },
            );
            return res.status(400).json({ error: "File not found in S3" });
          }

          // Update database record with confirmation
          const uploadRecord = await FileUploadModel.findOneAndUpdate(
            { key: fileKey, uploadedBy: userId },
            {
              status: "confirmed",
              fileSize: fileSize || result.size,
              relatedEntityId: relatedEntityId,
            },
            { new: true },
          );

          if (!uploadRecord) {
            logger.warn(
              `Upload record not found for key: ${fileKey} (user: ${userId})`,
            );
          }

          // If this is a league-logo upload for a user, update their signup
          if (
            uploadRecord?.uploadType === "league-logo" &&
            relatedEntityId &&
            leagueId
          ) {
            try {
              // Find the user and update the specific signup's logoFileKey
              const user = await LeagueUserModel.findById(relatedEntityId);

              if (user) {
                user.logo = fileKey;
                await user.save();
                logger.info(
                  `Updated LeagueUser ${relatedEntityId} signup for league ${leagueId} with logo: ${fileKey}`,
                );
              } else {
                logger.warn(
                  `Signup not found for league ${leagueId} in LeagueUser ${relatedEntityId}`,
                );
              }
            } catch (updateError) {
              logger.warn(
                `Failed to update LeagueUser signup with logo: ${updateError}`,
              );
              // Don't fail the confirmation if user update fails
            }
          }

          logger.info(
            `Upload confirmed for file: ${fileKey} (${result.size} bytes, user: ${userId})`,
          );

          return res.json({
            message: "Upload verified",
            size: result.size,
            key: fileKey,
          });
        } catch (error) {
          logger.error("Error confirming upload:", error);
          return res.status(400).json({ error: "File confirmation failed" });
        }
      },
    },
  },
};
