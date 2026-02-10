import { Request, Response, NextFunction } from "express";
import FileUploadModel from "../models/file-upload.model";

const RATE_LIMITS = {
  perHour: 10,
  perDay: 50,
  perWeek: 200,
};

export async function uploadRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.payload?.sub;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [hourCount, dayCount, weekCount] = await Promise.all([
      FileUploadModel.countDocuments({
        uploadedBy: userId,
        createdAt: { $gte: oneHourAgo },
      }),
      FileUploadModel.countDocuments({
        uploadedBy: userId,
        createdAt: { $gte: oneDayAgo },
      }),
      FileUploadModel.countDocuments({
        uploadedBy: userId,
        createdAt: { $gte: oneWeekAgo },
      }),
    ]);

    //TODO: replace with PDZError with proper error codes and messages

    if (hourCount >= RATE_LIMITS.perHour) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perHour} uploads per hour allowed. Try again later.`,
        retryAfter: 3600,
      });
      return;
    }

    if (dayCount >= RATE_LIMITS.perDay) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perDay} uploads per day allowed. Try again tomorrow.`,
        retryAfter: 86400,
      });
      return;
    }

    if (weekCount >= RATE_LIMITS.perWeek) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perWeek} uploads per week allowed.`,
        retryAfter: 604800,
      });
      return;
    }

    (req as any).uploadCounts = { hourCount, dayCount, weekCount };

    next();
  } catch (error) {
    console.error("Rate limiter error:", error);
    res.status(500).json({ error: "Rate limit check failed" });
  }
}

export async function checkUserStorageQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.payload?.sub;
    const MAX_STORAGE_PER_USER = 100 * 1024 * 1024;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const uploads = await FileUploadModel.find({
      uploadedBy: userId,
      status: { $ne: "deleted" },
    }).select("fileSize");

    const totalStorage = uploads.reduce(
      (sum, upload) => sum + upload.fileSize,
      0,
    );

    if (totalStorage >= MAX_STORAGE_PER_USER) {
      res.status(413).json({
        error: "Storage quota exceeded",
        message: `Maximum storage quota (${MAX_STORAGE_PER_USER / 1024 / 1024}MB) reached. Delete old files to upload new ones.`,
        currentUsage: totalStorage,
        quota: MAX_STORAGE_PER_USER,
      });
      return;
    }

    (req as any).userStorageUsed = totalStorage;

    next();
  } catch (error) {
    console.error("Storage quota check error:", error);
    res.status(500).json({ error: "Storage quota check failed" });
  }
}
