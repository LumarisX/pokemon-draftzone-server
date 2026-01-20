import { Request, Response } from "express";
import { Route, sendError } from "./index";
import { s3Service } from "../services/s3.service";
import { logger } from "../app";
import { jwtCheck } from "../middleware/jwtcheck";

export const FileRoutes: Route = {
  middleware: [jwtCheck],
  subpaths: {
    "/league-upload": {
      get: async (req: Request, res: Response) => {
        try {
          if (!s3Service.isEnabled()) {
            return res.status(503).json({
              error: "File upload service is not configured",
            });
          }

          const { filename, contentType } = req.query;

          if (
            !filename ||
            typeof filename !== "string" ||
            typeof contentType !== "string" ||
            !contentType.startsWith("image/")
          ) {
            return res.status(400).json({ error: "Invalid file metadata" });
          }

          const key = s3Service.generateFileKey(filename, "league-uploads");

          // Get presigned URL (expires in 2 minutes)
          const url = await s3Service.getPresignedUploadUrl(
            key,
            contentType,
            120,
          );

          logger.info(`Generated presigned URL for league upload: ${key}`);

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
      get: async (req: Request, res: Response) => {
        try {
          if (!s3Service.isEnabled()) {
            return res.status(503).json({
              error: "File upload service is not configured",
            });
          }

          const { filename, contentType } = req.query;

          if (
            !filename ||
            typeof filename !== "string" ||
            typeof contentType !== "string" ||
            !contentType.startsWith("image/")
          ) {
            return res.status(400).json({ error: "Invalid file metadata" });
          }

          const key = s3Service.generateFileKey(filename, "team-uploads");

          // Get presigned URL (expires in 2 minutes)
          const url = await s3Service.getPresignedUploadUrl(
            key,
            contentType,
            120,
          );

          logger.info(`Generated presigned URL for team upload: ${key}`);

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

          const { fileKey } = req.body;

          if (!fileKey || typeof fileKey !== "string") {
            return res.status(400).json({ error: "File key is required" });
          }

          const result = await s3Service.verifyFileExists(fileKey);

          if (!result.exists) {
            return res.status(400).json({ error: "File not found in S3" });
          }

          logger.info(
            `Upload confirmed for file: ${fileKey} (${result.size} bytes)`,
          );

          return res.json({
            message: "Upload verified",
            size: result.size,
          });
        } catch (error) {
          logger.error("Error confirming upload:", error);
          return res.status(400).json({ error: "File not found in S3" });
        }
      },
    },
  },
};
