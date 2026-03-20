import { getRuleset } from "../../data/rulesets";
import { getName, getRandom } from "./pokedex.service";

jest.mock("../../data/rulesets", () => ({
  getRuleset: jest.fn(),
}));

describe("Pokedex Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getName", () => {
    it("should return the name of a valid pokemon ID", () => {
      const mockSpeciesGet = jest.fn().mockReturnValue({ name: "Pikachu" });
      (getRuleset as jest.Mock).mockReturnValue({
        species: {
          get: mockSpeciesGet,
        },
      });

      const result = getName("pikachu");
      expect(result).toBe("Pikachu");
      expect(getRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockSpeciesGet).toHaveBeenCalledWith("pikachu");
    });

    it("should return an empty string for an invalid pokemon ID", () => {
      const mockSpeciesGet = jest.fn().mockReturnValue(undefined);
      (getRuleset as jest.Mock).mockReturnValue({
        species: {
          get: mockSpeciesGet,
        },
      });

      const result = getName("invalidpokemon");
      expect(result).toBe("");
      expect(getRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockSpeciesGet).toHaveBeenCalledWith("invalidpokemon");
    });
  });

  describe("getRandom", () => {
    const makeMockSpecies = (
      id: string,
      tier: string,
      doublesTier = "DUU",
      nfe = false,
    ) => ({
      id,
      name: id,
      exists: true,
      battleOnly: undefined,
      nfe,
      types: ["Electric"],
      tier,
      natDexTier: tier,
      doublesTier,
      baseStats: {
        hp: 50,
        atk: 50,
        def: 50,
        spa: 50,
        spd: 50,
        spe: 50,
      },
      abilities: { "0": "Static" },
      changesFrom: undefined,
    });

    const makeMockRuleset = (
      species: ReturnType<typeof makeMockSpecies>[],
      isNatDex = false,
    ) =>
      ({
        isNatDex,
        species,
      }) as unknown;

    it("falls back to the next lower singles tier when requested tier is unavailable", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("uumon", "UU"),
        makeMockSpecies("rumon", "RU"),
      ]);

      const result = getRandom(1, ruleset as never, { layout: "1" } as never, {
        tier: "OU",
      });

      expect(result).toHaveLength(1);
      expect(result[0].tier).toBe("UU");
      expect(result[0].id).toBe("uumon");
    });

    it("falls back to the next lower doubles tier when requested tier is unavailable", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("duumon", "UU", "DUU"),
        makeMockSpecies("drumon", "UU", "DRU"),
      ]);

      const result = getRandom(1, ruleset as never, { layout: "2" } as never, {
        tier: "DOU",
      });

      expect(result).toHaveLength(1);
      expect(result[0].tier).toBe("DUU");
      expect(result[0].id).toBe("duumon");
    });

    it("still returns an empty array when no tier in the fallback chain exists", () => {
      const ruleset = makeMockRuleset([makeMockSpecies("lcmon", "LC")]);

      const result = getRandom(1, ruleset as never, { layout: "1" } as never, {
        tier: "ZU",
      });

      expect(result).toEqual([]);
    });

    it("falls back to Untiered when lower-tier fallback is unavailable", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("untieredmon", "Untiered"),
      ]);

      const result = getRandom(1, ruleset as never, { layout: "1" } as never, {
        tier: "ZU",
      });

      expect(result).toHaveLength(1);
      expect(result[0].tier).toBe("Untiered");
      expect(result[0].id).toBe("untieredmon");
    });

    it("falls back to NFE when allowed and Untiered is unavailable", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("nfemon", "NFE", "DUU", true),
      ]);

      const result = getRandom(1, ruleset as never, { layout: "1" } as never, {
        tier: "ZU",
        nfe: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].tier).toBe("NFE");
      expect(result[0].id).toBe("nfemon");
    });

    it("does not fall back to NFE when NFE is excluded", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("nfemon", "NFE", "DUU", true),
      ]);

      const result = getRandom(1, ruleset as never, { layout: "1" } as never, {
        tier: "ZU",
      });

      expect(result).toEqual([]);
    });

    it("fills remaining picks from the next lower tier when requested tier has too few mons", () => {
      const ruleset = makeMockRuleset([
        makeMockSpecies("uberone", "Uber"),
        makeMockSpecies("ubertwo", "Uber"),
        makeMockSpecies("ouone", "OU"),
      ]);

      const result = getRandom(3, ruleset as never, { layout: "1" } as never, {
        tier: "Uber",
      });

      expect(result).toHaveLength(3);
      const uberCount = result.filter(
        (pokemon) => pokemon.tier === "Uber",
      ).length;
      const ouCount = result.filter((pokemon) => pokemon.tier === "OU").length;
      expect(uberCount).toBe(2);
      expect(ouCount).toBe(1);
    });
  });
});
