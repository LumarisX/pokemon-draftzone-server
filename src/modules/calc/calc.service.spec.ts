import { CalcService } from "./calc.service";

describe("CalcService", () => {
  const service = new CalcService();

  it("resolves a supported move into a damage distribution", () => {
    const result = service.calculate({
      attacker: { species: "Lucario", nature: "Modest", evs: { spa: 252 } },
      defender: { species: "Blissey", evs: { hp: 252, spd: 252 } },
      move: "Aura Sphere",
    });

    expect(result.supported).toBe(true);
    expect(result.damage!.min).toBeGreaterThan(0);
    expect(result.damage!.max).toBeGreaterThan(result.damage!.min);
    expect(result.outcomes!.length).toBeGreaterThan(1);
  });

  it("returns probabilities that sum to one", () => {
    const result = service.calculate({
      attacker: { species: "Lucario", evs: { spa: 252 } },
      defender: { species: "Blissey", evs: { hp: 252 } },
      move: "Aura Sphere",
    });

    const total = result.outcomes!.reduce((sum, o) => sum + o.probability, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("reports the branch structure the calculator used", () => {
    const result = service.calculate({
      attacker: { species: "Cloyster", ability: "Skill Link" },
      defender: { species: "Blissey" },
      move: "Rock Blast",
    });

    expect(result.branches!.hits).toEqual([{ hits: 5, weight: 1 }]);
    expect(result.branches!.accuracy).toEqual([
      { lands: true, weight: 9 },
      { lands: false, weight: 1 },
    ]);
  });

  it("surfaces secondary effects it will branch on", () => {
    const result = service.calculate({
      attacker: { species: "Volcarona", evs: { spa: 252 } },
      defender: { species: "Garchomp" },
      move: "Flamethrower",
    });

    expect(result.branches!.secondaries).toHaveLength(2);
    expect(result.branches!.secondaries[0].effects[0]).toContain("brn");
  });

  it("explains why an unsupported move was refused", () => {
    const result = service.calculate({
      attacker: { species: "Talonflame" },
      defender: { species: "Blissey" },
      move: "Brave Bird",
    });

    expect(result.supported).toBe(false);
    expect(result.reasons).toContain("recoil");
    expect(result.input).toBeDefined();
  });

  it("echoes the normalized input so the caller can see what was understood", () => {
    const result = service.calculate({
      attacker: { species: "Dragapult", teraType: "Fairy", terastallized: true },
      defender: { species: "Garchomp" },
      move: "Dazzling Gleam",
    });

    const input = result.input as {
      attacker: { terastallized: boolean; teraType: string };
      move: { basePower: number };
    };
    expect(input.attacker.terastallized).toBe(true);
    expect(input.attacker.teraType).toBe("Fairy");
    expect(input.move.basePower).toBe(80);
  });

  describe("forced outcomes", () => {
    const base = {
      attacker: { species: "Lucario", nature: "Modest", evs: { spa: 252 } },
      defender: { species: "Blissey", evs: { hp: 252, spd: 252 } },
      move: "Aura Sphere",
    };

    it("always-crit collapses the crit branch to a certainty", () => {
      const result = service.calculate({
        ...base,
        overrides: { crit: "always" },
      });
      expect(result.branches!.crit).toEqual([{ crit: true, weight: 1 }]);
    });

    it("never-crit removes the crit branch entirely", () => {
      const result = service.calculate({
        ...base,
        overrides: { crit: "never" },
      });
      expect(result.branches!.crit).toEqual([{ crit: false, weight: 1 }]);
    });

    it("always-crit does strictly more damage than never-crit", () => {
      const crit = service.calculate({ ...base, overrides: { crit: "always" } });
      const none = service.calculate({ ...base, overrides: { crit: "never" } });
      expect(crit.damage!.min).toBeGreaterThan(none.damage!.max);
    });

    it("always-hit removes the accuracy branch", () => {
      const result = service.calculate({
        ...base,
        move: "Rock Blast",
        overrides: { hit: "always" },
      });
      expect(result.branches!.accuracy).toEqual([{ lands: true, weight: 1 }]);
    });

    it("always-miss leaves the target untouched at certainty", () => {
      const result = service.calculate({
        ...base,
        move: "Rock Blast",
        overrides: { hit: "never" },
      });

      expect(result.branches!.accuracy).toEqual([{ lands: false, weight: 1 }]);
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes![0].damage).toBe(0);
      expect(result.outcomes![0].probability).toBeCloseTo(1, 6);
      expect(result.ko!.chances.every((chance) => chance === 0)).toBe(true);
    });

    it("echoes the overrides it applied", () => {
      const result = service.calculate({
        ...base,
        overrides: { crit: "always" },
      });
      const input = result.input as {
        overrides: { hit: string; crit: string };
      };
      expect(input.overrides).toEqual({ hit: "roll", crit: "always" });
    });
  });

  it("gives knockout chances per turn", () => {
    const result = service.calculate({
      attacker: { species: "Lucario", evs: { atk: 252 } },
      defender: { species: "Blissey", evs: { hp: 252 } },
      move: "Close Combat",
      turns: 3,
    });

    if (result.supported) {
      expect(result.ko!.chances).toHaveLength(3);
    } else {
      expect(result.reasons!.length).toBeGreaterThan(0);
    }
  });
});
