export const DISCORD_NAME_MAX = 37;
export const GAME_NAME_MAX = 32;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;
export const FALLBACK_DISPLAY_NAME = "Coach";

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N} _\-.']*[\p{L}\p{N}])?$/u;
const DISPLAY_NAME_DISALLOWED = /[^\p{L}\p{N} _\-.']/gu;

export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const length = [...trimmed].length;
  if (length < DISPLAY_NAME_MIN || length > DISPLAY_NAME_MAX) return null;
  if (trimmed.includes("  ")) return null;
  return DISPLAY_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

const timeZones = new Set<string>(
  (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [],
);

export function isValidTimeZone(value: string): boolean {
  return value === "UTC" || timeZones.has(value);
}

export function suggestDisplayName(username: string): string | null {
  const cleaned = [
    ...username
      .trim()
      .replace(DISPLAY_NAME_DISALLOWED, "")
      .replace(/ {2,}/g, " "),
  ]
    .slice(0, DISPLAY_NAME_MAX)
    .join("")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return normalizeDisplayName(cleaned);
}

export function randomCoachName(): string {
  const digits = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `${FALLBACK_DISPLAY_NAME} ${digits}`;
}

export function defaultDisplayName(username: string | undefined): string {
  const suggested = username ? suggestDisplayName(username) : null;
  return suggested ?? randomCoachName();
}

export function displayNameOrFallback(
  displayName: string | null | undefined,
  username?: string | null,
): string {
  if (displayName) return displayName;
  const suggested = username ? suggestDisplayName(username) : null;
  return suggested ?? FALLBACK_DISPLAY_NAME;
}
