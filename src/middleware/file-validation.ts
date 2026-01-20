import { Request, Response, NextFunction } from "express";
import * as fileType from "file-type";

// Security constants
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
export const ALLOWED_FILE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
];

// Validate file name
export function validateFileName(fileName: string): {
  valid: boolean;
  error?: string;
} {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, error: "File name is required" };
  }

  // Check for path traversal attempts
  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return {
      valid: false,
      error: "Invalid file name: path traversal detected",
    };
  }

  // Check file extension
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`,
    };
  }

  // Check file name length
  if (fileName.length > 255) {
    return { valid: false, error: "File name too long (max 255 characters)" };
  }

  return { valid: true };
}

// Validate content type
export function validateContentType(contentType: string): {
  valid: boolean;
  error?: string;
} {
  if (!contentType) {
    return { valid: false, error: "Content type is required" };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(contentType.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid content type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

// Validate file size
export function validateFileSize(fileSize: number): {
  valid: boolean;
  error?: string;
} {
  if (!fileSize || fileSize <= 0) {
    return { valid: false, error: "File size must be greater than 0" };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    };
  }

  return { valid: true };
}

// Verify file buffer matches declared content type (prevents file type spoofing)
export async function verifyFileBuffer(
  buffer: Buffer,
  declaredContentType: string,
): Promise<{ valid: boolean; error?: string; detectedType?: string }> {
  try {
    const detected = await fileType.fromBuffer(buffer);

    if (!detected) {
      return {
        valid: false,
        error: "Could not determine file type from content",
      };
    }

    // Check if detected MIME type is in allowed list
    if (!ALLOWED_IMAGE_TYPES.includes(detected.mime)) {
      return {
        valid: false,
        error: `Detected file type (${detected.mime}) is not allowed`,
        detectedType: detected.mime,
      };
    }

    // Check if detected type matches declared type
    if (detected.mime !== declaredContentType.toLowerCase()) {
      return {
        valid: false,
        error: `File content type mismatch. Declared: ${declaredContentType}, Detected: ${detected.mime}`,
        detectedType: detected.mime,
      };
    }

    return { valid: true, detectedType: detected.mime };
  } catch (error) {
    return {
      valid: false,
      error: "Error verifying file content",
    };
  }
}

// Combined validation middleware for upload requests
export function validateUploadRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { fileName, contentType } = req.query;

  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName query parameter is required" });
    return;
  }

  if (!contentType || typeof contentType !== "string") {
    res.status(400).json({ error: "contentType query parameter is required" });
    return;
  }

  // Validate file name
  const fileNameValidation = validateFileName(fileName);
  if (!fileNameValidation.valid) {
    res.status(400).json({ error: fileNameValidation.error });
    return;
  }

  // Validate content type
  const contentTypeValidation = validateContentType(contentType);
  if (!contentTypeValidation.valid) {
    res.status(400).json({ error: contentTypeValidation.error });
    return;
  }

  next();
}
