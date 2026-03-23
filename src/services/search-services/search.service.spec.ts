import { getRuleset } from "../../data/rulesets";
import {
  type SearchPokemonOptions,
  parseSearchRequest,
  searchPokemon,
} from "./search.service";

describe("searchPokemon", () => {
  const ruleset = getRuleset("Gen9 NatDex");

  it("supports structured object filters with in arrays", async () => {
    const options: SearchPokemonOptions = {
      searches: [
        {
          field: "num",
          operator: "in",
          value: [25, 26],
        },
      ],
      sortBy: "num",
      sortDirection: "asc",
    };

    const result = await searchPokemon(ruleset, options);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((specie) => [25, 26].includes(specie.num))).toBe(true);
    expect(result.some((specie) => specie.id === "pikachu")).toBe(true);
  });

  it("supports structured OR mode", async () => {
    const options: SearchPokemonOptions = {
      mode: "or",
      searches: [
        {
          field: "name",
          operator: "eq",
          value: "Pikachu",
        },
        {
          field: "name",
          operator: "eq",
          value: "Charizard",
        },
      ],
    };

    const result = await searchPokemon(ruleset, options);

    expect(result.some((specie) => specie.id === "pikachu")).toBe(true);
    expect(result.some((specie) => specie.id === "charizard")).toBe(true);
  });

  it("supports nested structured boolean groups", async () => {
    const options: SearchPokemonOptions = {
      mode: "or",
      searches: [
        {
          mode: "and",
          searches: [
            { field: "types", operator: "contains", value: "Electric" },
            { field: "abilities", operator: "contains", value: "Static" },
          ],
        },
        {
          mode: "or",
          searches: [
            { field: "name", operator: "eq", value: "Charizard" },
            {
              mode: "and",
              searches: [
                { field: "num", operator: "eq", value: 150 },
                { field: "bst", operator: "gte", value: 680 },
              ],
            },
          ],
        },
      ],
    };

    const result = await searchPokemon(ruleset, options);

    expect(result.some((specie) => specie.id === "pikachu")).toBe(true);
    expect(result.some((specie) => specie.id === "charizard")).toBe(true);
    expect(result.some((specie) => specie.id === "mewtwo")).toBe(true);
    expect(result.some((specie) => specie.id === "bulbasaur")).toBe(false);
  });

  it("parseSearchRequest normalizes a JSON payload string", () => {
    const normalized = parseSearchRequest(
      JSON.stringify({
        mode: "or",
        searches: [
          { field: "name", operator: "eq", value: "Pikachu" },
          { field: "name", operator: "eq", value: "Raichu" },
        ],
      }),
    );

    expect(normalized.mode).toBe("or");
    expect(normalized.searches).toEqual([
      { field: "name", operator: "eq", value: "Pikachu" },
      { field: "name", operator: "eq", value: "Raichu" },
    ]);
  });

  it("parseSearchRequest normalizes a partial options object", () => {
    const normalized = parseSearchRequest({
      searches: [{ field: "name", operator: "eq", value: "Pikachu" }],
    });

    expect(normalized.searches).toEqual([
      { field: "name", operator: "eq", value: "Pikachu" },
    ]);
    expect(normalized.mode).toBe("and");
    expect(normalized.limit).toBe(0);
    expect(normalized.offset).toBe(0);
  });

  it("parseSearchRequest defaults for non-JSON string payloads", () => {
    const normalized = parseSearchRequest("name = Pikachu");

    expect(normalized.searches).toEqual([]);
    expect(normalized.mode).toBe("and");
    expect(normalized.sortBy).toBe("num");
  });

  it("excludes cosmetic formes by default unless explicitly requested", async () => {
    const sourceRuleset = getRuleset("Gen9 NatDex");
    const sourceSpecie = sourceRuleset.species.get("pikachu");

    expect(sourceSpecie).toBeDefined();
    if (!sourceSpecie) return;

    const normalSpecie = {
      ...sourceSpecie,
      id: "search-specie-normal",
      name: "Search Specie Normal",
      fullname: "pokemon: Search Specie Normal",
      num: 10001,
      isCosmeticForme: false,
    };
    const cosmeticSpecie = {
      ...sourceSpecie,
      id: "search-specie-cosmetic",
      name: "Search Specie Cosmetic",
      fullname: "pokemon: Search Specie Cosmetic",
      num: 10002,
      isCosmeticForme: true,
    };

    const speciesById = new Map<
      string,
      typeof normalSpecie | typeof cosmeticSpecie
    >([
      [normalSpecie.id, normalSpecie],
      [cosmeticSpecie.id, cosmeticSpecie],
    ]);
    const species = {
      get: (id: string) => speciesById.get(id),
      [Symbol.iterator]: function* () {
        yield* speciesById.values();
      },
    };

    const mockRuleset = Object.create(sourceRuleset) as typeof sourceRuleset;
    Object.defineProperty(mockRuleset, "species", {
      value: species,
      enumerable: true,
      configurable: true,
    });

    const defaultResult = await searchPokemon(mockRuleset, {});
    expect(
      defaultResult.some((specie) => specie.id === cosmeticSpecie.id),
    ).toBe(false);
    expect(defaultResult.some((specie) => specie.id === normalSpecie.id)).toBe(
      true,
    );

    const includeResult = await searchPokemon(mockRuleset, {
      searches: [{ field: "isCosmetic", operator: "eq", value: true }],
    });
    expect(
      includeResult.some((specie) => specie.id === cosmeticSpecie.id),
    ).toBe(true);
  });

  describe("move sub-filters (learnset)", () => {
    it("finds pokemon that learn a move by name", async () => {
      const options: SearchPokemonOptions = {
        searches: [
          {
            field: "learns",
            operator: "contains",
            moveFilters: [
              { field: "name", operator: "eq", value: "Thunderbolt" },
            ],
          },
        ],
      };

      const result = await searchPokemon(ruleset, options);

      expect(result.length).toBeGreaterThan(0);
      const learnsets = await Promise.all(result.map((s) => s.learnset()));
      expect(
        learnsets.every((moves) => moves.some((m) => m.name === "Thunderbolt")),
      ).toBe(true);
    });

    it("finds pokemon that learn a Fire-type move", async () => {
      const options: SearchPokemonOptions = {
        searches: [
          {
            field: "learns",
            operator: "contains",
            moveFilters: [{ field: "type", operator: "eq", value: "Fire" }],
          },
        ],
      };

      const result = await searchPokemon(ruleset, options);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.id === "charizard")).toBe(true);
    });

    it("finds pokemon that learn a physical Fire-type move with basePower >= 90", async () => {
      const options: SearchPokemonOptions = {
        searches: [
          {
            field: "learns",
            operator: "contains",
            moveFilters: [
              { field: "type", operator: "eq", value: "Fire" },
              { field: "category", operator: "eq", value: "Physical" },
              { field: "basePower", operator: "gte", value: 90 },
            ],
            moveMode: "and",
          },
        ],
      };

      const result = await searchPokemon(ruleset, options);

      expect(result.length).toBeGreaterThan(0);
    });

    it("finds pokemon that learn moves with or-mode move filters", async () => {
      const options: SearchPokemonOptions = {
        searches: [
          {
            field: "learns",
            operator: "contains",
            moveFilters: [
              { field: "name", operator: "eq", value: "Flamethrower" },
              { field: "name", operator: "eq", value: "Fire Blast" },
            ],
            moveMode: "or",
          },
        ],
      };

      const result = await searchPokemon(ruleset, options);

      expect(result.length).toBeGreaterThan(0);
    });
  });
});
