import { Specie } from "@pkmn/data";
import { abilityModifiers } from "./ability-modifiers";

function weakOf(overrides: Record<string, number> = {}) {
  return {
    Normal: 1,
    Fire: 1,
    Water: 1,
    Electric: 1,
    Grass: 1,
    Ice: 1,
    Fighting: 1,
    Poison: 1,
    Ground: 1,
    Flying: 1,
    Psychic: 1,
    Bug: 1,
    Rock: 1,
    Ghost: 1,
    Dragon: 1,
    Dark: 1,
    Steel: 1,
    Fairy: 1,
    ...overrides,
  };
}

function apply(ability: string, weak: Record<string, number>, specie: Partial<Record<keyof Specie, unknown>> = {}) {
  abilityModifiers[ability]!(weak, specie as Specie);
  return weak;
}

describe("abilityModifiers", () => {
  describe("single-type immunities", () => {
    it.each([
      ["Water Absorb", "Water"],
      ["Desolate Land", "Water"],
      ["Storm Drain", "Water"],
      ["Volt Absorb", "Electric"],
      ["Lightning Rod", "Electric"],
      ["Motor Drive", "Electric"],
      ["Flash Fire", "Fire"],
      ["Primordial Sea", "Fire"],
      ["Well-Baked Body", "Fire"],
      ["Sap Sipper", "Grass"],
      ["Levitate", "Ground"],
      ["Earth Eater", "Ground"],
      ["Mountaineer", "Rock"],
    ])("%s grants immunity to %s", (ability, type) => {
      const weak = apply(ability, weakOf({ [type]: 2 }));
      expect(weak[type]).toBe(0);
    });
  });

  describe("single-status immunities", () => {
    it.each([
      ["Limber", "par"],
      ["Sweet Veil", "slp"],
      ["Vital Spirit", "slp"],
      ["Insomnia", "slp"],
      ["Magma Armor", "frz"],
      ["Thermal Exchange", "brn"],
      ["Water Veil", "brn"],
    ])("%s grants immunity to %s", (ability, statusKey) => {
      const weak = apply(ability, weakOf({ [statusKey]: 1 }));
      expect(weak[statusKey]).toBe(0);
    });

    it.each(["Immunity", "Pastel Veil"])(
      "%s grants immunity to both regular and bad poison",
      (ability) => {
        const weak = apply(ability, weakOf({ psn: 1, tox: 1 }));
        expect(weak.psn).toBe(0);
        expect(weak.tox).toBe(0);
      },
    );
  });

  it("Fluffy doubles Fire weakness", () => {
    const weak = apply("Fluffy", weakOf({ Fire: 1 }));
    expect(weak.Fire).toBe(2);
  });

  it("Dry Skin increases Fire weakness by 25% and grants Water immunity", () => {
    const weak = apply("Dry Skin", weakOf({ Fire: 2, Water: 2 }));
    expect(weak.Fire).toBe(2.5);
    expect(weak.Water).toBe(0);
  });

  it("Thick Fat halves both Ice and Fire weakness", () => {
    const weak = apply("Thick Fat", weakOf({ Ice: 2, Fire: 2 }));
    expect(weak.Ice).toBe(1);
    expect(weak.Fire).toBe(1);
  });

  it.each(["Heatproof", "Drizzle"])(
    "%s halves Fire weakness (rain/heat-resistance proxy)",
    (ability) => {
      const weak = apply(ability, weakOf({ Fire: 2 }));
      expect(weak.Fire).toBe(1);
    },
  );

  it("Water Bubble halves Fire weakness and grants burn immunity", () => {
    const weak = apply("Water Bubble", weakOf({ Fire: 2, brn: 1 }));
    expect(weak.Fire).toBe(1);
    expect(weak.brn).toBe(0);
  });

  it.each(["Drought", "Orichalcum Pulse"])(
    "%s halves Water weakness (sun proxy)",
    (ability) => {
      const weak = apply(ability, weakOf({ Water: 2 }));
      expect(weak.Water).toBe(1);
    },
  );

  it.each(["Purifying Salt", "Shields Down", "Comatose"])(
    "%s grants immunity to every major status condition",
    (ability) => {
      const weak = apply(
        ability,
        weakOf({ brn: 1, par: 1, frz: 1, slp: 1, psn: 1, tox: 1 }),
      );
      expect(weak.brn).toBe(0);
      expect(weak.par).toBe(0);
      expect(weak.frz).toBe(0);
      expect(weak.slp).toBe(0);
      expect(weak.psn).toBe(0);
      expect(weak.tox).toBe(0);
    },
  );

  it("Purifying Salt also halves Ghost weakness", () => {
    const weak = apply("Purifying Salt", weakOf({ Ghost: 2 }));
    expect(weak.Ghost).toBe(1);
  });

  it("Overcoat grants immunity to powder, sandstorm, and hail", () => {
    const weak = apply("Overcoat", weakOf({ powder: 1, sandstorm: 1, hail: 1 }));
    expect(weak.powder).toBe(0);
    expect(weak.sandstorm).toBe(0);
    expect(weak.hail).toBe(0);
  });

  it("Magic Guard grants immunity to sandstorm and hail, but not powder", () => {
    const weak = apply("Magic Guard", weakOf({ powder: 1, sandstorm: 1, hail: 1 }));
    expect(weak.sandstorm).toBe(0);
    expect(weak.hail).toBe(0);
    expect(weak.powder).toBe(1);
  });

  it.each(["Sand Force", "Sand Rush", "Sand Veil"])(
    "%s grants immunity to sandstorm only",
    (ability) => {
      const weak = apply(ability, weakOf({ sandstorm: 1, hail: 1 }));
      expect(weak.sandstorm).toBe(0);
      expect(weak.hail).toBe(1);
    },
  );

  it.each(["Ice Body", "Snow Cloak"])(
    "%s grants immunity to hail only",
    (ability) => {
      const weak = apply(ability, weakOf({ sandstorm: 1, hail: 1 }));
      expect(weak.hail).toBe(0);
      expect(weak.sandstorm).toBe(1);
    },
  );

  describe("Delta Stream", () => {
    it("halves Ice, Electric, and Rock weakness for Flying-type Pokemon", () => {
      const weak = apply(
        "Delta Stream",
        weakOf({ Ice: 2, Electric: 2, Rock: 2 }),
        { types: ["Dragon", "Flying"] },
      );
      expect(weak.Ice).toBe(1);
      expect(weak.Electric).toBe(1);
      expect(weak.Rock).toBe(1);
    });

    it("does nothing for non-Flying Pokemon", () => {
      const weak = apply(
        "Delta Stream",
        weakOf({ Ice: 2, Electric: 2, Rock: 2 }),
        { types: ["Dragon"] },
      );
      expect(weak.Ice).toBe(2);
      expect(weak.Electric).toBe(2);
      expect(weak.Rock).toBe(2);
    });
  });

  describe("Wonder Guard", () => {
    it("zeroes out every type that isn't super effective", () => {
      const weak = apply("Wonder Guard", weakOf({ Fire: 2, Water: 1, Grass: 0.5 }));
      expect(weak.Fire).toBe(2);
      expect(weak.Water).toBe(0);
      expect(weak.Grass).toBe(0);
    });
  });

  it.each(["Prism Armor", "Solid Rock", "Filter"])(
    "%s reduces super-effective damage by 25%%, leaving neutral/resisted damage alone",
    (ability) => {
      const weak = apply(ability, weakOf({ Fire: 2, Water: 1 }));
      expect(weak.Fire).toBe(1.5);
      expect(weak.Water).toBe(1);
    },
  );

  it("Primal Armor halves super-effective damage, leaving neutral/resisted damage alone", () => {
    const weak = apply("Primal Armor", weakOf({ Fire: 2, Water: 1 }));
    expect(weak.Fire).toBe(1);
    expect(weak.Water).toBe(1);
  });
});
