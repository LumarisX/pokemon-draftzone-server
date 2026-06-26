import { Specie } from "@pkmn/data";
import {
  competativeHP,
  competitiveAttacks,
  competitiveDefenses,
  competitiveSpeed,
  getBST,
  getCST,
} from "./specie-stats";

function specieWithStats(baseStats: {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}): Specie {
  return { baseStats } as unknown as Specie;
}

describe("getBST", () => {
  it("sums all six base stats", () => {
    const specie = specieWithStats({ hp: 50, atk: 60, def: 70, spa: 80, spd: 90, spe: 100 });

    expect(getBST(specie)).toBe(450);
  });
});

describe("competativeHP", () => {
  it("passes HP through unchanged", () => {
    expect(competativeHP(80)).toBe(80);
    expect(competativeHP(0)).toBe(0);
  });
});

describe("competitiveAttacks", () => {
  it("returns the sum of atk/spa when they're equal", () => {
    expect(competitiveAttacks(100, 100)).toBeCloseTo(200);
  });

  it("rewards a lopsided atk/spa split over a balanced one with the same total", () => {
    const balanced = competitiveAttacks(100, 100);
    const lopsided = competitiveAttacks(130, 70);

    expect(lopsided).toBeGreaterThan(balanced);
    expect(lopsided).toBeCloseTo(130 + 70 + Math.pow(130 - 70, 2) / (2 * 128));
  });
});

describe("competitiveDefenses", () => {
  it("returns the sum of def/spd when they're equal", () => {
    expect(competitiveDefenses(100, 100)).toBeCloseTo(200);
  });

  it("penalizes a lopsided def/spd split versus a balanced one with the same total", () => {
    const balanced = competitiveDefenses(100, 100);
    const lopsided = competitiveDefenses(130, 70);

    expect(lopsided).toBeLessThan(balanced);
    expect(lopsided).toBeCloseTo(130 + 70 - Math.pow(130 - 70, 2) / 256);
  });
});

describe("competitiveSpeed", () => {
  it("returns exactly the center value (80) when speed equals the center", () => {
    expect(competitiveSpeed(80)).toBeCloseTo(80);
  });

  it("increases monotonically with speed, bounded below by 0 and above by the amplitude (196)", () => {
    const low = competitiveSpeed(0);
    const center = competitiveSpeed(80);
    const high = competitiveSpeed(150);
    const veryHigh = competitiveSpeed(500);

    expect(low).toBeLessThan(center);
    expect(center).toBeLessThan(high);
    expect(high).toBeLessThan(veryHigh);
    expect(low).toBeGreaterThan(0);
    expect(veryHigh).toBeLessThan(196);
  });
});

describe("getCST", () => {
  it("rounds the sum of the four competitive sub-stats", () => {
    const baseStats = { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 };
    const specie = specieWithStats(baseStats);

    const expected = Math.round(
      competativeHP(baseStats.hp) +
        competitiveAttacks(baseStats.atk, baseStats.spa) +
        competitiveDefenses(baseStats.def, baseStats.spd) +
        competitiveSpeed(baseStats.spe),
    );

    expect(getCST(specie)).toBe(expected);
  });

  it("returns an integer", () => {
    const specie = specieWithStats({ hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 });

    expect(Number.isInteger(getCST(specie))).toBe(true);
  });
});
