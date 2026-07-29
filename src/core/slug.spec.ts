import { generateSlug, SLUG_ALPHABET, SLUG_LENGTH } from "./slug";

describe("generateSlug", () => {
  it("defaults to 8 characters", () => {
    expect(generateSlug()).toHaveLength(8);
    expect(SLUG_LENGTH).toBe(8);
  });

  it("honours an explicit length, including lengths that span several byte draws", () => {
    for (const length of [1, 4, 8, 22, 100]) {
      expect(generateSlug(length)).toHaveLength(length);
    }
  });

  it("emits only base62 characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSlug()).toMatch(/^[0-9A-Za-z]{8}$/);
    }
  });

  it("uses a 62-character alphabet with no duplicates", () => {
    expect(SLUG_ALPHABET).toHaveLength(62);
    expect(new Set(SLUG_ALPHABET).size).toBe(62);
  });

  it("does not repeat itself", () => {
    const slugs = new Set(Array.from({ length: 5000 }, () => generateSlug()));
    expect(slugs.size).toBe(5000);
  });

  /**
   * Guards the rejection sampling. A naive `byte % 62` maps bytes 248-255 back
   * onto '0'-'7', so those eight characters would appear ~1.6% more often than
   * the other 54. Over this sample that skew is far larger than the noise, so
   * a regression to plain modulo fails here.
   */
  it("distributes characters without modulo bias", () => {
    const counts = new Map<string, number>();
    const draws = 62 * 2000;

    for (const char of generateSlug(draws)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    expect(counts.size).toBe(62);

    const expected = draws / 62;
    for (const [char, count] of counts) {
      // ±15% tolerance: comfortably wider than random noise at this sample
      // size, comfortably tighter than the ~1.6% systematic skew accumulated
      // across the eight favoured characters.
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.15);
      expect(SLUG_ALPHABET).toContain(char);
    }
  });
});
