import { randomBytes } from "crypto";

export const SLUG_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const SLUG_LENGTH = 8;

export function generateSlug(length: number = SLUG_LENGTH): string {
  const size =
    typeof length === "number" && Number.isInteger(length) && length > 0
      ? length
      : SLUG_LENGTH;
  const limit = 256 - (256 % SLUG_ALPHABET.length);
  let slug = "";

  while (slug.length < size) {
    for (const byte of randomBytes(size - slug.length)) {
      if (byte >= limit) continue;
      slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      if (slug.length === size) break;
    }
  }

  return slug;
}
