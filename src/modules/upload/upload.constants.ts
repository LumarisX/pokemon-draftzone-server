// SVG is deliberately excluded - it can embed scripts and is unsafe to
// accept from users without sanitization.
export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageContentType =
  (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 120;
