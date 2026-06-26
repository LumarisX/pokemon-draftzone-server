import { getFormat } from "@core/data/formats/formats";
import { Rulesets } from "@core/data/rulesets/rulesets";
import { PokemonService } from "./pokemon.service";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const PALDEA_DEX = Rulesets["Gen 9"]["Paldea Dex"].ruleset;
const SINGLES = getFormat("Singles");
const VGC = getFormat("VGC");

describe("PokemonService", () => {
  let service: PokemonService;

  beforeEach(() => {
    service = new PokemonService();
  });

  describe("normalizeTierName", () => {
    it("returns an empty string for an undefined or empty tier", () => {
      expect(service.normalizeTierName(undefined)).toBe("");
      expect(service.normalizeTierName("")).toBe("");
    });

    it("strips wrapping parentheses and uppercases", () => {
      expect(service.normalizeTierName("(ou)")).toBe("OU");
    });

    it("trims surrounding whitespace and uppercases", () => {
      expect(service.normalizeTierName(" ou ")).toBe("OU");
    });

    it("trims surrounding whitespace before stripping parentheses", () => {
      expect(service.normalizeTierName(" (ou) ")).toBe("OU");
    });

    it("applies a known alias", () => {
      expect(service.normalizeTierName("Ubers")).toBe("UBER");
    });

    it("passes through an unknown tier unchanged (aside from case)", () => {
      expect(service.normalizeTierName("untiered")).toBe("UNTIERED");
    });
  });

  describe("isTierMatch", () => {
    it("matches case-insensitively after normalization", () => {
      expect(service.isTierMatch("(OU)", "ou")).toBe(true);
    });

    it("matches through an alias", () => {
      expect(service.isTierMatch("Ubers", "UBER")).toBe(true);
    });

    it("returns false for genuinely different tiers", () => {
      expect(service.isTierMatch("OU", "UU")).toBe(false);
    });
  });

  describe("buildTierFallbackOrder", () => {
    it("returns undefined when no tier was requested", () => {
      expect(service.buildTierFallbackOrder("tier", undefined)).toBeUndefined();
    });

    it("builds a singles fallback chain down the hierarchy, ending in the final fallbacks", () => {
      expect(service.buildTierFallbackOrder("tier", "OU")).toEqual([
        "OU",
        "UU",
        "RU",
        "NU",
        "PU",
        "ZU",
        "UNTIERED",
        "NFE",
      ]);
    });

    it("builds a doubles fallback chain using the doubles hierarchy", () => {
      expect(service.buildTierFallbackOrder("doublesTier", "DOU")).toEqual([
        "DOU",
        "DUU",
        "DRU",
        "DNU",
        "DPU",
        "DZU",
        "UNTIERED",
        "NFE",
      ]);
    });

    it("normalizes/aliases the requested tier before locating it in the hierarchy", () => {
      expect(service.buildTierFallbackOrder("tier", "Ubers")).toEqual([
        "UBER",
        "OU",
        "UU",
        "RU",
        "NU",
        "PU",
        "ZU",
        "UNTIERED",
        "NFE",
      ]);
    });

    it("appends only the final fallbacks (no extra hierarchy) when the tier isn't in the hierarchy", () => {
      expect(service.buildTierFallbackOrder("tier", "CUSTOMTIER")).toEqual([
        "CUSTOMTIER",
        "UNTIERED",
        "NFE",
      ]);
    });

    it("doesn't duplicate a final fallback that's already the requested tier", () => {
      expect(service.buildTierFallbackOrder("tier", "NFE")).toEqual([
        "NFE",
        "UNTIERED",
      ]);
    });
  });

  describe("groupSpeciesByBaseForm", () => {
    it("groups an alternate forme under its base species' id via changesFrom", () => {
      const charizard = NAT_DEX.species.get("charizard")!;
      const megaX = NAT_DEX.species.get("charizardmegax")!;
      const pikachu = NAT_DEX.species.get("pikachu")!;

      const result = service.groupSpeciesByBaseForm(
        [charizard, megaX, pikachu],
        NAT_DEX,
      );

      expect(result).toEqual([
        ["charizard", [charizard, megaX]],
        ["pikachu", [pikachu]],
      ]);
    });
  });

  describe("getSpecies / getName", () => {
    it("looks up a species (always against Gen9 NatDex) by id", () => {
      expect(service.getSpecies("pikachu")?.name).toBe("Pikachu");
    });

    it("returns undefined for an unknown species id", () => {
      expect(service.getSpecies("notarealpokemon")).toBeUndefined();
    });

    it("returns the species' name, or an empty string when not found", () => {
      expect(service.getName("pikachu")).toBe("Pikachu");
      expect(service.getName("notarealpokemon")).toBe("");
    });
  });

  describe("getRandom", () => {
    it("returns at most `count` Pokemon, each with a unique id and the expected shape", () => {
      const result = service.getRandom(6, NAT_DEX, SINGLES);

      expect(result.length).toBeLessThanOrEqual(6);
      const ids = result.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of result) {
        expect(entry).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          types: expect.any(Array),
          baseStats: expect.any(Object),
          abilities: expect.any(Array),
        });
      }
    });

    it("excludes not-fully-evolved Pokemon by default", () => {
      const result = service.getRandom(15, NAT_DEX, SINGLES);

      for (const entry of result) {
        expect(NAT_DEX.species.get(entry.id)?.nfe).toBeFalsy();
      }
    });

    it("includes not-fully-evolved Pokemon when nfe: false is passed", () => {
      let foundNfe = false;
      for (let attempt = 0; attempt < 5 && !foundNfe; attempt++) {
        const result = service.getRandom(40, NAT_DEX, SINGLES, { nfe: false });
        foundNfe = result.some((p) => NAT_DEX.species.get(p.id)?.nfe);
      }
      expect(foundNfe).toBe(true);
    });

    it("never returns a banned id", () => {
      const banned = ["garchomp", "tyranitar", "dragonite", "metagross"];

      const result = service.getRandom(20, NAT_DEX, SINGLES, { banned });

      for (const entry of result) {
        expect(banned).not.toContain(entry.id);
      }
    });

    it("never returns a Pokemon whose typing includes an excluded type", () => {
      const result = service.getRandom(15, NAT_DEX, SINGLES, {
        types: ["Fire", "Water"],
      });

      for (const entry of result) {
        expect(entry.types).not.toContain("Fire");
        expect(entry.types).not.toContain("Water");
      }
    });

    it("restricts to the requested singles tier on a non-National-Dex ruleset when the pool is large enough to avoid falling back", () => {
      const result = service.getRandom(5, PALDEA_DEX, SINGLES, { tier: "OU" });

      for (const entry of result) {
        expect(PALDEA_DEX.species.get(entry.id)?.tier).toBe("OU");
      }
    });

    it("uses the doubles tier hierarchy when the format is doubles on a non-National-Dex ruleset", () => {
      const result = service.getRandom(5, PALDEA_DEX, VGC, { tier: "DOU" });

      for (const entry of result) {
        expect(PALDEA_DEX.species.get(entry.id)?.doublesTier).toBe("DOU");
      }
    });

    it("uses the National Dex tier list (not the standard tier/doublesTier) for a National Dex ruleset, regardless of format", () => {
      expect(NAT_DEX.isNatDex).toBe(true);

      const singlesResult = service.getRandom(5, NAT_DEX, SINGLES, {
        tier: "OU",
      });
      const doublesResult = service.getRandom(5, NAT_DEX, VGC, { tier: "OU" });

      for (const entry of [...singlesResult, ...doublesResult]) {
        expect(NAT_DEX.species.get(entry.id)?.natDexTier).toBe("OU");
      }
    });
  });
});
