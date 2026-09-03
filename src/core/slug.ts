import { randomBytes } from "crypto";

/**
 * Base62 — the digits plus both cases, in ASCII order. URL-safe with no
 * percent-encoding, no separator characters, and nothing that needs escaping
 * in a path segment.
 */
export const SLUG_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 62^8 ≈ 2.18e14 — collisions are a backstop concern, not a design one. */
export const SLUG_LENGTH = 8;

/**
 * The single slug generator for every collection that has a `slug`.
 *
 * Uses rejection sampling rather than `byte % 62`. 256 is not a multiple of
 * 62, so a plain modulo would map bytes 248-255 back onto '0'-'7' and make
 * those eight characters ~1.6% likelier than the rest — a bias that shrinks
 * the effective keyspace. Bytes at or above the largest multiple of 62 that
 * fits in a byte (248) are discarded and re-drawn instead.
 *
 * Backed by `crypto.randomBytes`, not `Math.random()`: slugs are the only
 * thing standing between an unlisted draft and someone guessing its URL.
 */
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
