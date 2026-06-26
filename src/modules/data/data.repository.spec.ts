import { _getFormats, getFormats } from "@core/data/formats/formats";
import { getRulesets, getRulesetsGrouped } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
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
    it("builds a Pokemon for every species in the ruleset", () => {
      const result = repository.getSpeciesForRuleset("Gen9 NatDex");

      expect(result.length).toBeGreaterThan(1000);
      expect(result[0]).toBeInstanceOf(PDZPokemon);
      expect(result.every((p) => p.ruleset.name === "Gen9 NatDex")).toBe(true);
    });

    it("throws when the ruleset id is unknown", () => {
      expect(() => repository.getSpeciesForRuleset("NotARealRuleset")).toThrow(
        "Ruleset Id not found: NotARealRuleset",
      );
    });
  });

  describe("getRandomSpecies", () => {
    it("returns the requested number of distinct species from the ruleset", () => {
      const result = repository.getRandomSpecies("Gen9 NatDex", 5);

      expect(result.length).toBe(5);
      expect(new Set(result.map((p) => p.id)).size).toBe(5);
    });

    it("caps the result at the size of the filtered pool", () => {
      const result = repository.getRandomSpecies("Gen9 NatDex", 10, {
        tier: "Uber",
      });

      expect(result.length).toBeLessThanOrEqual(10);
      expect(result.every((p) => p.tier === "Uber")).toBe(true);
    });

    it("excludes banned species ids from the pool", () => {
      const result = repository.getRandomSpecies("Gen9 NatDex", 50, {
        tier: "Uber",
        banned: ["arceus"],
      });

      expect(result.some((p) => p.id === "arceus")).toBe(false);
    });
  });

  describe("getMovesForPokemon", () => {
    it("returns the learnset for the given species in the ruleset", async () => {
      const learnset = await repository.getMovesForPokemon(
        "Gen9 NatDex",
        "pikachu",
      );

      expect(learnset.some((move) => move.name === "Thunderbolt")).toBe(true);
    });

    it("throws when the species id is unknown", async () => {
      await expect(
        repository.getMovesForPokemon("Gen9 NatDex", "notaspecies"),
      ).rejects.toThrow();
    });
  });

  describe("getFormesForPokemon", () => {
    it("returns sibling formes (e.g. Mega forms) excluding the requested one", () => {
      const formes = repository.getFormesForPokemon("Gen9 NatDex", "venusaur");

      expect(formes.map((p) => p.id)).toEqual(["venusaurmega"]);
    });

    it("resolves siblings from a non-base forme too", () => {
      const formes = repository.getFormesForPokemon(
        "Gen9 NatDex",
        "charizardmegax",
      );

      expect(formes.map((p) => p.id).sort()).toEqual(
        ["charizard", "charizardmegay"].sort(),
      );
    });

    it("returns an empty list for a species with no alternate formes", () => {
      const formes = repository.getFormesForPokemon("Gen9 NatDex", "ditto");

      expect(formes).toEqual([]);
    });

    it("throws when the species id is unknown", () => {
      expect(() =>
        repository.getFormesForPokemon("Gen9 NatDex", "notaspecies"),
      ).toThrow();
    });
  });
});
