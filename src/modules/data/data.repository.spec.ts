import { _getFormats, getFormats } from "@core/data/formats/formats";
import { getRulesets, getRulesetsGrouped } from "@core/data/rulesets/rulesets";
import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { DataRepository } from "./data.repository";

describe("DataRepository", () => {
  let repository: DataRepository;

  beforeEach(() => {
    repository = new DataRepository();
  });

  describe("getFormats", () => {
    it("matches the grouped format listing from formats.ts", () => {
      expect(repository.getFormats()).toEqual(_getFormats());
    });
  });

  describe("getFormatsLegacy", () => {
    it("matches the flat format id listing from formats.ts", () => {
      expect(repository.getFormatsLegacy()).toEqual(getFormats());
    });
  });

  describe("getRulesets", () => {
    it("matches the grouped ruleset listing from rulesets.ts", () => {
      expect(repository.getRulesets()).toEqual(getRulesetsGrouped());
    });

    it("includes special-category rulesets (e.g. Rom Hacks) in the grouped listing", () => {
      const grouped = repository.getRulesets();
      const romHacksGroup = grouped.find(([groupName]) => groupName === "Rom Hacks");

      expect(romHacksGroup).toBeDefined();
    });
  });

  describe("getRulesetsLegacy", () => {
    it("matches the flat ruleset id listing from rulesets.ts", () => {
      expect(repository.getRulesetsLegacy()).toEqual(getRulesets());
    });

    it("includes special-category rulesets (e.g. Rom Hacks), consistent with the grouped listing", () => {
      const legacy = repository.getRulesetsLegacy();

      expect(legacy).toContain("radicalred");
      expect(legacy).toContain("insurgance");
    });
  });

  describe("getSpeciesForRuleset", () => {
    it("builds a DraftPokemon for every species in the ruleset", () => {
      const result = repository.getSpeciesForRuleset("Gen9 NatDex");

      expect(result.length).toBeGreaterThan(1000);
      expect(result[0]).toBeInstanceOf(DraftPokemon);
      expect(result.every((p) => p.ruleset.name === "Gen9 NatDex")).toBe(true);
    });

    it("throws when the ruleset id is unknown", () => {
      expect(() => repository.getSpeciesForRuleset("NotARealRuleset")).toThrow(
        "Ruleset Id not found: NotARealRuleset",
      );
    });
  });
});
