import {
  defaultDisplayName,
  displayNameOrFallback,
  isValidTimeZone,
  normalizeDisplayName,
  randomCoachName,
  suggestDisplayName,
} from "./user.identity";

describe("normalizeDisplayName", () => {
  it.each([
    ["Ash", "Ash"],
    ["  Ash Ketchum  ", "Ash Ketchum"],
    ["Pokémon Fan", "Pokémon Fan"],
    ["Ash_K-1.2", "Ash_K-1.2"],
    ["O'Brien", "O'Brien"],
    ["日本語", "日本語"],
    ["x".repeat(24), "x".repeat(24)],
  ])("accepts %j", (input, expected) => {
    expect(normalizeDisplayName(input)).toBe(expected);
  });

  it.each([
    "",
    "A",
    " A ",
    "x".repeat(25),
    "Ash  Ketchum",
    "_Ash",
    "Ash_",
    "-Ash",
    "Ash.",
    "Ash!",
    "Ash@home",
    "<b>Ash</b>",
  ])("rejects %j", (input) => {
    expect(normalizeDisplayName(input)).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(normalizeDisplayName(undefined)).toBeNull();
    expect(normalizeDisplayName(7)).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and UTC", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("EST5EDT-ish")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("suggestDisplayName", () => {
  it("returns a valid name unchanged apart from trimming", () => {
    expect(suggestDisplayName("  Ash Ketchum ")).toBe("Ash Ketchum");
  });

  it("drops disallowed characters and edge punctuation", () => {
    expect(suggestDisplayName("~~Ash!!")).toBe("Ash");
    expect(suggestDisplayName("Ash   Ketchum")).toBe("Ash Ketchum");
  });

  it("truncates to 24 characters", () => {
    expect(suggestDisplayName("a".repeat(40))).toBe("a".repeat(24));
  });

  it("is null when nothing usable is left", () => {
    expect(suggestDisplayName("!!")).toBeNull();
    expect(suggestDisplayName("a")).toBeNull();
  });
});

describe("randomCoachName", () => {
  it("is Coach and four digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomCoachName()).toMatch(/^Coach \d{4}$/);
    }
  });
});

describe("defaultDisplayName", () => {
  it("keeps a valid Google-style name", () => {
    expect(defaultDisplayName("Ash Ketchum")).toBe("Ash Ketchum");
  });

  it("cleans a name that has stray characters", () => {
    expect(defaultDisplayName("  ~Ash Ketchum!  ")).toBe("Ash Ketchum");
  });

  it("falls back to Coach and four digits for an emoji-only name", () => {
    expect(defaultDisplayName("😀😀😀")).toMatch(/^Coach \d{4}$/);
  });

  it("falls back when there is no username", () => {
    expect(defaultDisplayName(undefined)).toMatch(/^Coach \d{4}$/);
    expect(defaultDisplayName("")).toMatch(/^Coach \d{4}$/);
  });

  it("trims an overlong name to 24 characters", () => {
    const result = defaultDisplayName("a".repeat(40));
    expect(result).toBe("a".repeat(24));
    expect(normalizeDisplayName(result)).toBe(result);
  });

  it("always produces a valid display name", () => {
    for (const input of ["x", "!!!", "Ash", "日本語", "a@b.com", undefined]) {
      expect(normalizeDisplayName(defaultDisplayName(input))).not.toBeNull();
    }
  });
});

describe("displayNameOrFallback", () => {
  it("prefers the stored display name", () => {
    expect(displayNameOrFallback("Misty", "ash")).toBe("Misty");
  });

  it("uses the cleaned username when there is no display name", () => {
    expect(displayNameOrFallback(null, "Ash Ketchum")).toBe("Ash Ketchum");
  });

  it("uses a generic name when nothing is usable", () => {
    expect(displayNameOrFallback(undefined, undefined)).toBe("Coach");
    expect(displayNameOrFallback(null, "!!")).toBe("Coach");
  });
});
