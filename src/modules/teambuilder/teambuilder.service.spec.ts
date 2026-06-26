import { TeambuilderPokemonSet, TeambuilderService } from "./teambuilder.service";

describe("TeambuilderService", () => {
  let service: TeambuilderService;

  beforeEach(() => {
    service = new TeambuilderService();
  });

  describe("getPokemonData", () => {
    it("returns the species' teambuilder data for a valid id/ruleset", () => {
      const result = service.getPokemonData("pikachu", "Gen9 NatDex");

      return expect(result).resolves.toMatchObject({
        id: "pikachu",
        name: "Pikachu",
        types: ["Electric"],
      });
    });

    it("throws SPECIES.NOT_FOUND for an unknown id", () => {
      let error: unknown;
      try {
        service.getPokemonData("notarealpokemon", "Gen9 NatDex");
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ code: "SPC-001" });
    });
  });

  describe("shouldHighlightMove", () => {
    const pokemon: TeambuilderPokemonSet = {
      id: "pikachu" as any,
      types: ["Electric"],
      teraType: "Electric" as any,
      ability: "Adaptability",
      moves: [],
    };

    it("returns false when ability or move is missing", () => {
      expect(
        service.shouldHighlightMove({ ability: "", move: { type: "Electric" } as any, pokemon }),
      ).toBe(false);
      expect(
        service.shouldHighlightMove({ ability: "Adaptability", move: undefined as any, pokemon }),
      ).toBe(false);
    });

    it("returns true for Adaptability on a STAB move", () => {
      const result = service.shouldHighlightMove({
        ability: "Adaptability",
        move: { type: "Electric" } as any,
        pokemon,
      });

      expect(result).toBe(true);
    });

    it("returns false for Adaptability on a non-STAB move", () => {
      const result = service.shouldHighlightMove({
        ability: "Adaptability",
        move: { type: "Ice" } as any,
        pokemon,
      });

      expect(result).toBe(false);
    });

    it("returns false for Adaptability when no pokemon is given", () => {
      const result = service.shouldHighlightMove({
        ability: "Adaptability",
        move: { type: "Electric" } as any,
        pokemon: undefined,
      });

      expect(result).toBe(false);
    });

    it("returns false for any other ability", () => {
      const result = service.shouldHighlightMove({
        ability: "Static",
        move: { type: "Electric" } as any,
        pokemon,
      });

      expect(result).toBe(false);
    });
  });

  describe("shouldHighlightItem (not yet implemented)", () => {
    it("always returns false, even with valid ability/item", () => {
      const result = service.shouldHighlightItem({
        ability: "Levitate",
        item: { id: "lightball", pngId: "", name: "Light Ball", desc: "", tags: [] },
      });

      expect(result).toBe(false);
    });
  });

  describe("getModifiedMove / getModifiedType (not yet implemented)", () => {
    it("always return undefined", () => {
      expect(
        service.getModifiedMove({ ability: "Levitate", move: {} as any }),
      ).toBeUndefined();
      expect(
        service.getModifiedType({ move: {} as any, pokemon: {} as any }),
      ).toBeUndefined();
    });
  });

  describe("getProcessedLearnset", () => {
    function mewSet(overrides: Partial<TeambuilderPokemonSet> = {}): TeambuilderPokemonSet {
      return {
        id: "mew" as any,
        types: ["Psychic"],
        teraType: "Psychic" as any,
        ability: "Synchronize",
        moves: [],
        ...overrides,
      };
    }

    it("returns [] and logs without throwing when pokemon is missing", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: undefined as any,
        ruleset: "Gen9 NatDex",
      });

      expect(result).toEqual([]);
    });

    it("returns [] when the ruleset is missing", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: undefined as any,
      });

      expect(result).toEqual([]);
    });

    it("returns [] (rather than throwing) when the pokemon id doesn't exist", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet({ id: "notarealpokemon" as any }),
        ruleset: "Gen9 NatDex",
      });

      expect(result).toEqual([]);
    });

    it("computes isStab against the given pokemon's types, not the species' real types", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: "Gen9 NatDex",
      });
      const byId = Object.fromEntries(result.map((m) => [m.id, m]));

      expect(byId.psychic.isStab).toBe(true);
      expect(byId.dragonpulse.isStab).toBe(false);
    });

    it("derives flag-based tags from the move data", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: "Gen9 NatDex",
      });
      const byId = Object.fromEntries(result.map((m) => [m.id, m]));

      expect(byId.crunch.tags).toEqual(expect.arrayContaining(["Bite", "Contact"]));
      expect(byId.firepunch.tags).toEqual(expect.arrayContaining(["Punch", "Contact"]));
      expect(byId.hypervoice.tags).toContain("Sound");
      expect(byId.doubleedge.tags).toEqual(expect.arrayContaining(["Recoil", "Contact"]));
      expect(byId.bulletseed.tags).toEqual(expect.arrayContaining(["Multi-Hit", "Bullet"]));
      expect(byId.solarbeam.tags).toContain("Charge");
      expect(byId.hyperbeam.tags).toContain("Charge");
      expect(byId.leafblade.tags).toEqual(
        expect.arrayContaining(["Crit", "Contact", "Slicing"]),
      );
      expect(byId.dragonpulse.tags).toContain("Pulse");
      expect(byId.roost.tags).toContain("Healing");
      expect(byId.tailwind.tags).toContain("Wind");
    });

    it("sorts the result by strength, descending", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: "Gen9 NatDex",
      });

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].strength).toBeGreaterThanOrEqual(result[i].strength);
      }
    });

    it("gives Status moves a strength of 0", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: "Gen9 NatDex",
      });
      const byId = Object.fromEntries(result.map((m) => [m.id, m]));

      expect(byId.roost.category).toBe("Status");
      expect(byId.roost.strength).toBe(0);
      expect(byId.tailwind.strength).toBe(0);
    });

    it("applies the STAB multiplier only to moves that actually match the Pokemon's type", async () => {
      const result = await service.getProcessedLearnset({
        pokemon: mewSet(),
        ruleset: "Gen9 NatDex",
      });
      const byId = Object.fromEntries(result.map((m) => [m.id, m]));

      // psychic: 90 BP Special, isStab true. hypervoice: 90 BP Special, isStab false.
      expect(byId.psychic.basePower).toBe(byId.hypervoice.basePower);
      expect(byId.psychic.category).toBe(byId.hypervoice.category);
      expect(byId.psychic.isStab).toBe(true);
      expect(byId.hypervoice.isStab).toBe(false);
      // Each value is independently rounded to 1 decimal place, so compare the
      // underlying (pre-rounding) ratio with a looser tolerance.
      expect(byId.psychic.strength / byId.hypervoice.strength).toBeCloseTo(1.5, 1);
      expect(byId.psychic.strength).toBeGreaterThan(byId.hypervoice.strength);
    });
  });
});
