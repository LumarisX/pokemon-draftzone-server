export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageContentType =
  (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 120;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UNCLAIMED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
