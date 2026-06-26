import { ExternalTournamentAd } from "./external-tournament-ad.domain";

function buildAd(overrides: Partial<ConstructorParameters<typeof ExternalTournamentAd>[0]> = {}) {
  return new ExternalTournamentAd({
    leagueName: "Spring League",
    owner: "auth0|owner",
    description: "A friendly league",
    skillLevelRange: { from: "0", to: "1" },
    prizeValue: 0,
    platforms: ["Pokémon Showdown"],
    formats: ["Singles"],
    rulesets: ["Gen9 NatDex"],
    signupLink: "https://example.com/signup",
    closesAt: new Date("2026-02-01"),
    ...overrides,
  });
}

describe("ExternalTournamentAd skillLevels", () => {
  it("builds an inclusive range from a normally-ordered from/to", () => {
    const ad = buildAd({ skillLevelRange: { from: "1", to: "3" } });

    expect(ad.skillLevels).toEqual([1, 2, 3]);
  });

  it("swaps a reversed from/to before building the range", () => {
    const ad = buildAd({ skillLevelRange: { from: "3", to: "1" } });

    expect(ad.skillLevels).toEqual([1, 2, 3]);
  });

  it("builds a single-value range when from equals to", () => {
    const ad = buildAd({ skillLevelRange: { from: "2", to: "2" } });

    expect(ad.skillLevels).toEqual([2]);
  });

  it("produces an empty range for non-numeric bounds", () => {
    const ad = buildAd({ skillLevelRange: { from: "abc", to: "xyz" } });

    expect(ad.skillLevels).toEqual([]);
  });
});

describe("ExternalTournamentAd prizeValue", () => {
  it("converts a numeric prizeValue to a number", () => {
    expect(buildAd({ prizeValue: 3 }).prizeValue).toBe(3);
  });

  it("converts a string prizeValue to a number", () => {
    expect(buildAd({ prizeValue: "2" }).prizeValue).toBe(2);
  });

  it("defaults to 0 when prizeValue is falsy", () => {
    expect(buildAd({ prizeValue: 0 }).prizeValue).toBe(0);
    expect(buildAd({ prizeValue: undefined }).prizeValue).toBe(0);
  });
});

describe("ExternalTournamentAd tags", () => {
  it("tags 'prize' only when prizeValue is greater than 0", () => {
    expect(buildAd({ prizeValue: 1 }).tags).toContain("prize");
    expect(buildAd({ prizeValue: 0 }).tags).not.toContain("prize");
  });

  it("tags 'singles' for a layout-1 format and 'doubles' for a layout-2 format", () => {
    const singles = buildAd({ formats: ["Singles"] });
    const doubles = buildAd({ formats: ["VGC"] });

    expect(singles.tags).toContain("singles");
    expect(singles.tags).not.toContain("doubles");
    expect(doubles.tags).toContain("doubles");
    expect(doubles.tags).not.toContain("singles");
  });

  it("tags both 'singles' and 'doubles' when formats include both layouts", () => {
    const ad = buildAd({ formats: ["Singles", "VGC"] });

    expect(ad.tags).toContain("singles");
    expect(ad.tags).toContain("doubles");
  });

  it("tags 'ps' when any platform is Pokemon Showdown (with or without the accent)", () => {
    expect(buildAd({ platforms: ["Pokémon Showdown"] }).tags).toContain("ps");
    expect(buildAd({ platforms: ["Pokemon Showdown"] }).tags).toContain("ps");
  });

  it("tags 'game' when any platform isn't Pokemon Showdown", () => {
    const ad = buildAd({ platforms: ["Nintendo Switch"] });

    expect(ad.tags).toContain("game");
    expect(ad.tags).not.toContain("ps");
  });

  it("tags both 'ps' and 'game' when both kinds of platform are present", () => {
    const ad = buildAd({ platforms: ["Pokémon Showdown", "Nintendo Switch"] });

    expect(ad.tags).toContain("ps");
    expect(ad.tags).toContain("game");
  });

  it.each([
    [{ from: "0", to: "0" }, "poke"],
    [{ from: "1", to: "1" }, "great"],
    [{ from: "2", to: "2" }, "ultra"],
    [{ from: "3", to: "3" }, "master"],
  ])("tags '%s' -> %s for a skill range covering that level", (range, tag) => {
    const ad = buildAd({ skillLevelRange: range as { from: string; to: string } });

    expect(ad.tags).toContain(tag);
  });

  it("tags every skill level the range spans", () => {
    const ad = buildAd({ skillLevelRange: { from: "0", to: "3" } });

    expect(ad.tags).toEqual(
      expect.arrayContaining(["poke", "great", "ultra", "master"]),
    );
  });

  it("doesn't tag skill levels outside the range", () => {
    const ad = buildAd({ skillLevelRange: { from: "2", to: "3" } });

    expect(ad.tags).not.toContain("poke");
    expect(ad.tags).not.toContain("great");
    expect(ad.tags).toContain("ultra");
    expect(ad.tags).toContain("master");
  });

  it("omits all tags when nothing applies", () => {
    const ad = buildAd({
      prizeValue: 0,
      formats: [],
      platforms: [],
      skillLevelRange: { from: "abc", to: "xyz" },
    });

    expect(ad.tags).toEqual([]);
  });
});
