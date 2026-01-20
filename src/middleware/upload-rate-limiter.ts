import { Request, Response, NextFunction } from "express";
import FileUploadModel from "../models/file-upload.model";

// Rate limit configuration
const RATE_LIMITS = {
  perHour: 10, // Max 10 uploads per hour
  perDay: 50, // Max 50 uploads per day
  perWeek: 200, // Max 200 uploads per week
};

/**
 * Rate limiting middleware for file uploads
 * Checks upload history from database to enforce limits
 */
export async function uploadRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Extract user ID from Auth0 JWT (set by jwtCheck middleware)
    const userId = req.auth?.payload?.sub;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Count uploads in different time windows
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

    // Check rate limits
    if (hourCount >= RATE_LIMITS.perHour) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perHour} uploads per hour allowed. Try again later.`,
        retryAfter: 3600, // seconds
      });
      return;
    }

    if (dayCount >= RATE_LIMITS.perDay) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perDay} uploads per day allowed. Try again tomorrow.`,
        retryAfter: 86400, // seconds
      });
      return;
    }

    if (weekCount >= RATE_LIMITS.perWeek) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMITS.perWeek} uploads per week allowed.`,
        retryAfter: 604800, // seconds
      });
      return;
    }

    // Attach counts to request for logging
    (req as any).uploadCounts = { hourCount, dayCount, weekCount };

    next();
  } catch (error) {
    console.error("Rate limiter error:", error);
    res.status(500).json({ error: "Rate limit check failed" });
  }
}

/**
 * Check total storage used by user (optional additional check)
 */
export async function checkUserStorageQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth?.payload?.sub;
    const MAX_STORAGE_PER_USER = 100 * 1024 * 1024; // 100MB per user

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Calculate total storage used
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
