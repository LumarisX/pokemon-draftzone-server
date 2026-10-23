import { getRuleset } from "@core/data/rulesets/rulesets";
import { detectLayouts, parseHeading, Recognizer } from "./layouts";
import { NameMatcher, variants } from "./name-matcher";
import { parseSheet } from "./sheet-parser";
import { sheetExportUrl, TierListImportService } from "./tier-list-import.service";
import { ImportAliasRepository } from "./import-alias.repository";

const ruleset = getRuleset("Gen9 NatDex");

function recognizer(matcher: NameMatcher): Recognizer {
  return {
    strict: (text) => {
      const match = matcher.match(text);
      return (
        (match.status === "matched" && match.via !== "spelling") ||
        match.status === "not-in-ruleset"
      );
    },
    loose: (text) => matcher.match(text).status !== "unmatched",
  };
}

describe("parseSheet", () => {
  it("reads tab-separated text pasted from a spreadsheet", () => {
    expect(parseSheet("S\tA\nGarchomp\tRotom-Wash\n")).toEqual([
      ["S", "A"],
      ["Garchomp", "Rotom-Wash"],
    ]);
  });

  it("reads CSV with quoted cells and trims ragged edges", () => {
    expect(parseSheet('Name,Tier,\n"Ogerpon, Wellspring",S,\n\n')).toEqual([
      ["Name", "Tier"],
      ["Ogerpon, Wellspring", "S"],
    ]);
  });

  it("strips a byte-order mark", () => {
    expect(parseSheet("﻿S,A")).toEqual([["S", "A"]]);
  });
});

describe("parseHeading", () => {
  it.each([
    ["S Tier (20)", { name: "S Tier", cost: 20 }],
    ["15 pts", { name: "15 pts", cost: 15 }],
    ["12", { name: "12 pts", cost: 12 }],
    ["A - 14", { name: "A", cost: 14 }],
    ["Tier 3", { name: "Tier 3" }],
    ["OU", { name: "OU" }],
  ])("reads %s", (text, expected) => {
    expect(parseHeading(text)).toEqual(expected);
  });
});

describe("NameMatcher", () => {
  const matcher = new NameMatcher(ruleset);

  it.each([
    ["Garchomp", "garchomp", "exact"],
    ["Lando-T", "landorustherian", "alias"],
    ["Alolan Ninetales", "ninetalesalola", "alias"],
    ["Rapid Strike Urshifu", "urshifurapidstrike", "forme"],
    ["Urshifu-R", "urshifurapidstrike", "forme"],
    ["Wash Rotom", "rotomwash", "forme"],
    ["Garchomp*", "garchomp", "exact"],
    ["Kingambit (C)", "kingambit", "forme"],
    ["Tera Captain: Gholdengo", "gholdengo", "forme"],
    ["Ogerpon (Wellspring)", "ogerponwellspring", "exact"],
    ["Paldean Tauros", "taurospaldeacombat", "forme"],
  ])("matches %s", (text, id, via) => {
    expect(matcher.match(text)).toMatchObject({
      status: "matched",
      pokemon: [expect.objectContaining({ id })],
      via,
    });
  });

  it("suggests a close spelling without applying it", () => {
    expect(matcher.match("Goldengo")).toMatchObject({
      status: "suggested",
      pokemon: [expect.objectContaining({ id: "gholdengo" })],
    });
  });

  it("offers every forme a partial name could mean", () => {
    const match = matcher.match("Tauros-Pal");
    expect(match.status).toBe("ambiguous");
    expect(match.options?.map((option) => option.id)).toEqual(
      expect.arrayContaining(["taurospaldeacombat", "taurospaldeablaze", "taurospaldeaaqua"]),
    );
  });

  it("suggests the one forme a partial name can mean", () => {
    expect(matcher.match("Tauros-Paldea-B")).toMatchObject({
      status: "suggested",
      pokemon: [expect.objectContaining({ id: "taurospaldeablaze" })],
    });
  });

  it("knows a Pokémon that isn't in this ruleset", () => {
    const gen8 = new NameMatcher(getRuleset("Gen8 NatDex"));
    expect(gen8.match("Kingambit")).toMatchObject({
      status: "not-in-ruleset",
      pokemon: [expect.objectContaining({ id: "kingambit" })],
    });
  });

  it("gives up on text that isn't a Pokémon", () => {
    expect(matcher.match("Missingno Tier")).toMatchObject({ status: "unmatched" });
  });

  it("uses names the owner confirmed before", () => {
    const remembered = new NameMatcher(
      ruleset,
      new Map([["sharkboy", ["garchomp"]]]),
    );
    expect(remembered.match("Sharkboy")).toMatchObject({
      status: "matched",
      via: "remembered",
      pokemon: [expect.objectContaining({ id: "garchomp" })],
    });
  });

  it("flags a base forme listed without its other formes", () => {
    const entries = [
      { match: matcher.match("Urshifu") },
      { match: matcher.match("Garchomp") },
      { match: matcher.match("Landorus") },
      { match: matcher.match("Landorus-Therian") },
    ];
    matcher.flagUnspecifiedFormes(entries);

    expect(entries.map((entry) => entry.match.status)).toEqual([
      "ambiguous",
      "matched",
      "matched",
      "matched",
    ]);
    expect(entries[0].match.options?.map((option) => option.id)).toEqual(
      expect.arrayContaining(["urshifu", "urshifurapidstrike"]),
    );
  });

  it("produces the community spellings it tries", () => {
    expect(variants("Therian Landorus")).toContain("Landorus-Therian");
  });
});

describe("detectLayouts", () => {
  const matcher = new NameMatcher(ruleset);

  it("reads one tier per column", () => {
    const rows = parseSheet(
      [
        "S (20)\tA (15)\tBanned",
        "Garchomp\tRotom-Wash\tKoraidon",
        "Kingambit\tLando-T\t",
        "Goldengo\t\t",
      ].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.layout).toBe("tier-columns");
    expect(best.tiers.map((tier) => [tier.name, tier.cost, tier.banned])).toEqual([
      ["S", 20, false],
      ["A", 15, false],
      ["Banned", undefined, true],
    ]);
    expect(best.tiers[0].entries.map((entry) => entry.text)).toEqual([
      "Garchomp",
      "Kingambit",
      "Goldengo",
    ]);
  });

  it("reads a cost row under the tier names", () => {
    const rows = parseSheet(
      ["Tier 1\tTier 2", "20\t15", "Garchomp\tRotom-Wash", "Kingambit\tToxapex"].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.layout).toBe("tier-columns");
    expect(best.tiers.map((tier) => [tier.name, tier.cost])).toEqual([
      ["Tier 1", 20],
      ["Tier 2", 15],
    ]);
  });

  it("reads a Pokémon and its tier on each row, with notes", () => {
    const rows = parseSheet(
      [
        "Pokemon,Tier,Notes",
        "Garchomp,S,",
        "Kingambit,S,No Kowtow Cleave",
        "Rotom-Wash,A,",
        "Toxapex,A,",
      ].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.layout).toBe("name-tier-rows");
    expect(best.tiers.map((tier) => tier.name)).toEqual(["S", "A"]);
    expect(best.tiers[0].entries[1]).toMatchObject({
      text: "Kingambit",
      note: "No Kowtow Cleave",
    });
  });

  it("reads a Pokémon and its cost on each row, highest cost first", () => {
    const rows = parseSheet(
      ["Garchomp,18", "Toxapex,12", "Kingambit,18", "Rotom-Wash,15"].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.layout).toBe("name-cost-rows");
    expect(best.tiers.map((tier) => [tier.name, tier.cost])).toEqual([
      ["18 pts", 18],
      ["15 pts", 15],
      ["12 pts", 12],
    ]);
  });

  it("reads tier headings with Pokémon under each", () => {
    const rows = parseSheet(
      [
        "S Tier (20)",
        "Garchomp",
        "Kingambit",
        "",
        "A Tier (15)",
        "Rotom-Wash",
        "Lando-T",
        "Banned",
        "Koraidon",
      ].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.layout).toBe("tier-blocks");
    expect(best.tiers.map((tier) => [tier.name, tier.cost, tier.entries.length])).toEqual([
      ["S Tier", 20, 2],
      ["A Tier", 15, 2],
      ["Banned", undefined, 1],
    ]);
  });

  it("marks a Tera Captain column as an addon", () => {
    const rows = parseSheet(
      ["Pokemon,Tier,Tera Captain", "Garchomp,S,", "Kingambit,S,Y", "Toxapex,A,x"].join("\n"),
    );

    const [best] = detectLayouts(rows, recognizer(matcher));

    expect(best.tiers[0].entries[1]).toMatchObject({
      text: "Kingambit",
      addons: ["Tera Captain"],
    });
  });
});

describe("TierListImportService.preview", () => {
  const aliasRepo = {
    forOwner: jest.fn().mockResolvedValue(new Map()),
  } as unknown as ImportAliasRepository;
  const service = new TierListImportService(aliasRepo);

  it("counts what needs a person and finds duplicates", async () => {
    const result = await service.preview(
      {
        text: [
          "S (20)\tA (15)",
          "Garchomp\tGarchomp",
          "Goldengo\tUrshifu",
          "Notapokemon\tKingambit",
        ].join("\n"),
        format: "Singles",
        ruleset: "Gen9 NatDex",
      },
      "auth0|owner",
    );

    expect(result.layout).toBe("tier-columns");
    expect(result.counts).toMatchObject({
      total: 6,
      matched: 3,
      suggested: 1,
      ambiguous: 1,
      unmatched: 1,
      duplicates: 1,
    });
    expect(result.duplicates).toEqual([
      { pokemonId: "garchomp", name: "Garchomp", tiers: [0, 1] },
    ]);
  });

  it("refuses an empty paste", async () => {
    await expect(
      service.preview(
        { text: "  ", format: "Singles", ruleset: "Gen9 NatDex" },
        "auth0|owner",
      ),
    ).rejects.toMatchObject({ code: "LR-TIER-010" });
  });
});

describe("sheetExportUrl", () => {
  it("turns a sharing link into a CSV export of the same tab", () => {
    expect(
      sheetExportUrl(
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=12345",
      ),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/export?format=csv&gid=12345",
    );
  });

  it("handles a published sheet", () => {
    expect(
      sheetExportUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghij/pubhtml"),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghij/pub?output=csv",
    );
  });

  it("refuses anything that isn't a Google Sheet", () => {
    expect(() => sheetExportUrl("https://example.com/sheet.csv")).toThrow();
    expect(() =>
      sheetExportUrl("https://docs.google.com.evil.example/spreadsheets/d/abcdefghijk"),
    ).toThrow();
  });
});
