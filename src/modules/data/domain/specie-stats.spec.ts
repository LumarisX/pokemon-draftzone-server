import { Rulesets } from "@core/data/rulesets/rulesets";
import { Specie, StatsTable } from "@pkmn/data";
import {
  BATTLE_FORMES,
  buildScorePool,
  bulkValue,
  effectiveStats,
  getBST,
  getScores,
  isFullyEvolved,
  powerValue,
  rulesetScorePool,
  scoreEntry,
} from "./specie-stats";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const NAT_DEX_POOL = rulesetScorePool(NAT_DEX);
const plain = (baseStats: StatsTable, abilities: string[] = []) => ({
  baseStats,
  abilities,
});
const scoresOf = (entry: StatsTable) => getScores(plain(entry), NAT_DEX_POOL);

function stats(
  hp: number,
  atk: number,
  def: number,
  spa: number,
  spd: number,
  spe: number,
): StatsTable {
  return { hp, atk, def, spa, spd, spe };
}

const flat = (value: number) =>
  stats(value, value, value, value, value, value);

describe("getBST", () => {
  it("sums all six base stats", () => {
    const specie = { baseStats: stats(50, 60, 70, 80, 90, 100) } as unknown as Specie;

    expect(getBST(specie)).toBe(450);
  });
});

describe("powerValue", () => {
  it("treats both attacking stats alike", () => {
    expect(powerValue(stats(80, 130, 80, 40, 80, 80))).toBeCloseTo(
      powerValue(stats(80, 40, 80, 130, 80, 80)),
    );
  });

  it("barely credits an unusable second attacking stat", () => {
    expect(powerValue(stats(80, 100, 80, 10, 80, 80))).toBeCloseTo(100, 0);
    expect(powerValue(stats(80, 100, 80, 60, 80, 80))).toBeLessThan(104);
  });

  it("rewards a second attacking stat as strong as the first", () => {
    expect(powerValue(stats(80, 100, 80, 100, 80, 80))).toBeCloseTo(118.9, 1);
    expect(powerValue(stats(80, 100, 80, 100, 80, 80))).toBeGreaterThan(
      powerValue(stats(80, 100, 80, 20, 80, 80)),
    );
  });
});

describe("bulkValue", () => {
  it("returns the flat base stat for an even spread", () => {
    expect(bulkValue(flat(100))).toBeCloseTo(100);
    expect(bulkValue(flat(80))).toBeCloseTo(80);
  });

  it("counts HP, Def and SpD equally", () => {
    expect(bulkValue(stats(20, 0, 230, 0, 230, 0))).toBeCloseTo(160);
    expect(bulkValue(stats(100, 0, 135, 0, 20, 0))).toBeCloseTo(85);
  });

  it("does not penalize a defense split", () => {
    const even = bulkValue(stats(100, 0, 100, 0, 100, 0));
    const lopsided = bulkValue(stats(100, 0, 160, 0, 40, 0));

    expect(lopsided).toBeCloseTo(even);
  });
});

describe("getScores", () => {
  it("keeps every score between 0 and 9.999 to three decimals", () => {
    for (const entry of [flat(1), flat(255), stats(20, 10, 230, 10, 230, 5)]) {
      for (const value of Object.values(scoresOf(entry))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(9.999);
        expect(value).toBe(Math.round(value * 1000) / 1000);
      }
    }
  });

  it("puts the pool's median near 5", () => {
    const overall = Array.from(NAT_DEX.species)
      .filter(isFullyEvolved)
      .map((specie) => scoresOf(specie.baseStats).overall)
      .sort((a, b) => a - b);

    expect(overall[Math.floor(overall.length / 2)]).toBeGreaterThan(4.5);
    expect(overall[Math.floor(overall.length / 2)]).toBeLessThan(5.5);
  });

  it("ranks speed relative to the pool rather than by raw gaps", () => {
    const at = (spe: number) => scoresOf(stats(80, 80, 80, 80, 80, spe)).speed;

    expect(at(100) - at(90)).toBeGreaterThan(at(200) - at(150));
  });

  it("weights bulk and speed equally in the overall score", () => {
    const pool = buildScorePool([50, 70, 90, 110, 130].map((v) => plain(flat(v))));
    const fastFrail = getScores(plain(stats(50, 90, 50, 0, 50, 130)), pool);
    const slowSturdy = getScores(plain(stats(130, 90, 130, 0, 130, 50)), pool);

    expect(fastFrail.overall).toBe(slowSturdy.overall);
  });

  it("ranks a specialist above an even spread with the same total", () => {
    const pool = buildScorePool([50, 70, 90, 110, 130].map((v) => plain(flat(v))));
    const even = getScores(plain(stats(90, 90, 90, 0, 90, 90)), pool);
    const specialist = getScores(plain(stats(50, 90, 50, 0, 50, 170)), pool);

    expect(specialist.overall).toBeGreaterThan(even.overall);
  });

  it("scores the same Pokémon differently against a different pool", () => {
    const mid = flat(90);
    const weakPool = buildScorePool([50, 60, 70, 80].map((v) => plain(flat(v))));
    const strongPool = buildScorePool(
      [100, 110, 120, 130].map((v) => plain(flat(v))),
    );

    expect(getScores(plain(mid), weakPool).overall).toBe(9.999);
    expect(getScores(plain(mid), strongPool).overall).toBe(0);
  });

  it("caches the ruleset pool", () => {
    expect(rulesetScorePool(NAT_DEX)).toBe(NAT_DEX_POOL);
  });
});

describe("abilities", () => {
  const medicham = stats(60, 60, 75, 60, 75, 80);
  const slaking = stats(150, 160, 100, 95, 65, 100);

  it("doubles base Attack for Huge Power and Pure Power", () => {
    expect(effectiveStats(plain(medicham, ["Pure Power"])).atk).toBe(120);
    expect(effectiveStats(plain(medicham, ["Huge Power"])).atk).toBe(120);
  });

  it("halves base Attack and Speed for Slow Start", () => {
    const adjusted = effectiveStats(plain(flat(100), ["Slow Start"]));

    expect(adjusted.atk).toBe(50);
    expect(adjusted.spe).toBe(50);
  });

  it("halves both attacking stats for Truant", () => {
    const adjusted = effectiveStats(plain(slaking, ["Truant"]));

    expect(adjusted.atk).toBe(80);
    expect(adjusted.spa).toBe(47.5);
  });

  it("uses the best ability when there is a choice", () => {
    const adjusted = effectiveStats(
      plain(medicham, ["Telepathy", "Pure Power"]),
    );

    expect(adjusted.atk).toBe(120);
  });

  it("skips banned abilities", () => {
    const entry = scoreEntry(
      { baseStats: medicham, abilities: { 0: "Pure Power", H: "Telepathy" } } as never,
      NAT_DEX.species,
      ["Pure Power"],
    );

    expect(effectiveStats(entry).atk).toBe(60);
  });

  it("scores Palafin, Terapagos and Wishiwashi in the forme they fight in", () => {
    for (const [base, forme] of Object.entries(BATTLE_FORMES)) {
      const entry = scoreEntry(NAT_DEX.species.get(base)!, NAT_DEX.species);

      expect(entry.baseStats).toEqual(NAT_DEX.species.get(forme)!.baseStats);
    }
  });

  it("keeps a Pokémon's own stats when it has no battle forme", () => {
    const garchomp = NAT_DEX.species.get("Garchomp")!;

    expect(scoreEntry(garchomp, NAT_DEX.species).baseStats).toEqual(
      garchomp.baseStats,
    );
  });

  it("raises a Huge Power user and lowers a Truant user", () => {
    expect(getScores(plain(medicham, ["Pure Power"]), NAT_DEX_POOL).power).toBeGreaterThan(
      getScores(plain(medicham), NAT_DEX_POOL).power,
    );
    expect(getScores(plain(slaking, ["Truant"]), NAT_DEX_POOL).overall).toBeLessThan(
      getScores(plain(slaking), NAT_DEX_POOL).overall,
    );
  });
});
