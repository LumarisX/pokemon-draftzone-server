import { ID, Move } from "@pkmn/data";
import { getEffectivePower, getPowerModifier } from "./move-power";

function buildMove(overrides: Partial<Record<keyof Move, unknown>> = {}): Move {
  return {
    id: "testmove" as ID,
    accuracy: 100,
    basePower: 40,
    willCrit: false,
    critRatio: undefined,
    multihit: undefined,
    condition: undefined,
    flags: {},
    self: undefined,
    mindBlownRecoil: false,
    selfdestruct: false,
    ...overrides,
  } as unknown as Move;
}

describe("getEffectivePower", () => {
  it("divides base power by accuracy (out of 100) and applies the default 1.5x crit-chance multiplier", () => {
    const move = buildMove({ accuracy: 100, basePower: 40 });

    expect(getEffectivePower(move)).toBeCloseTo(40 * 1.5);
  });

  it("treats accuracy: true as always-hit (no accuracy division)", () => {
    const move = buildMove({ accuracy: true, basePower: 80 });

    expect(getEffectivePower(move)).toBeCloseTo(80 * 1.5);
  });

  it("scales down for moves with less than 100% accuracy", () => {
    const move = buildMove({ accuracy: 50, basePower: 100 });

    expect(getEffectivePower(move)).toBeCloseTo(((100 * 50) / 100) * 1.5);
  });

  describe("crit ratio", () => {
    it.each([
      [1, 1 + (1.5 * 1) / 24],
      [2, 1 + (1.5 * 3) / 24],
      [3, 1 + (1.5 * 12) / 24],
    ])("uses the crit-stage multiplier for critRatio %d", (critRatio, multiplier) => {
      const move = buildMove({ accuracy: 100, basePower: 40, critRatio });

      expect(getEffectivePower(move)).toBeCloseTo(40 * multiplier);
    });

    it("falls back to the flat 1.5x multiplier when critRatio is out of the known range", () => {
      const move = buildMove({ accuracy: 100, basePower: 40, critRatio: 4 });

      expect(getEffectivePower(move)).toBeCloseTo(40 * 1.5);
    });

    it("falls back to the flat 1.5x multiplier for a guaranteed-crit move regardless of critRatio", () => {
      const move = buildMove({
        accuracy: 100,
        basePower: 40,
        willCrit: true,
        critRatio: 3,
      });

      expect(getEffectivePower(move)).toBeCloseTo(40 * 1.5);
    });
  });

  describe("multihit", () => {
    it("applies the special 3.3x multiplier for a 2-5 hit range", () => {
      const move = buildMove({ accuracy: 100, basePower: 25, multihit: [2, 5] });

      expect(getEffectivePower(move)).toBeCloseTo(25 * 1.5 * 3.3);
    });

    it("averages the hit range for any other multihit array", () => {
      const move = buildMove({ accuracy: 100, basePower: 25, multihit: [2, 3] });

      expect(getEffectivePower(move)).toBeCloseTo(25 * 1.5 * 2.5);
    });

    it("multiplies by a fixed multihit count", () => {
      const move = buildMove({ accuracy: 100, basePower: 25, multihit: 2 });

      expect(getEffectivePower(move)).toBeCloseTo(25 * 1.5 * 2);
    });

    it("ignores a multihit count of 1", () => {
      const move = buildMove({ accuracy: 100, basePower: 40, multihit: 1 });

      expect(getEffectivePower(move)).toBeCloseTo(40 * 1.5);
    });
  });

  describe("condition duration", () => {
    it("quarters power for a one-turn condition (e.g. a OHKO-style guaranteed effect)", () => {
      const move = buildMove({
        accuracy: 100,
        basePower: 40,
        condition: { duration: 1 } as any,
      });

      expect(getEffectivePower(move)).toBeCloseTo((40 * 1.5) / 4);
    });

    it("halves power for a multi-turn condition", () => {
      const move = buildMove({
        accuracy: 100,
        basePower: 40,
        condition: { duration: 3 } as any,
      });

      expect(getEffectivePower(move)).toBeCloseTo((40 * 1.5) / 2);
    });
  });

  it("halves power for charge moves (e.g. Solar Beam)", () => {
    const move = buildMove({ accuracy: 100, basePower: 120, flags: { charge: 1 } as any });

    expect(getEffectivePower(move)).toBeCloseTo(120 * 1.5 * 0.5);
  });

  it("halves power for recharge moves (e.g. Hyper Beam)", () => {
    const move = buildMove({ accuracy: 100, basePower: 150, flags: { recharge: 1 } as any });

    expect(getEffectivePower(move)).toBeCloseTo(150 * 1.5 * 0.5);
  });

  it("halves power for locked-move moves (e.g. Outrage)", () => {
    const move = buildMove({
      accuracy: 100,
      basePower: 120,
      self: { volatileStatus: "lockedmove" } as any,
    });

    expect(getEffectivePower(move)).toBeCloseTo(120 * 1.5 * 0.5);
  });

  it("halves power for Mind Blown-style recoil moves", () => {
    const move = buildMove({ accuracy: 100, basePower: 150, mindBlownRecoil: true });

    expect(getEffectivePower(move)).toBeCloseTo(150 * 1.5 * 0.5);
  });

  it("reduces power to 1% for self-destruct moves", () => {
    const move = buildMove({ accuracy: 100, basePower: 200, selfdestruct: true });

    expect(getEffectivePower(move)).toBeCloseTo(200 * 1.5 * 0.01);
  });

  describe("conditionalMoves", () => {
    it("applies a 10x power reduction for Steel Roller and Dream Eater", () => {
      const steelRoller = buildMove({ id: "steelroller", accuracy: 100, basePower: 130 });
      const dreamEater = buildMove({ id: "dreameater", accuracy: 100, basePower: 100 });

      expect(getEffectivePower(steelRoller)).toBeCloseTo(130 * 1.5 * 0.1);
      expect(getEffectivePower(dreamEater)).toBeCloseTo(100 * 1.5 * 0.1);
    });

    it("doesn't reduce power for a move that merely shares an id-like array index (e.g. \"0\")", () => {
      const move = buildMove({ id: "0" as any, accuracy: 100, basePower: 40 });

      expect(getEffectivePower(move)).toBeCloseTo(40 * 1.5);
    });
  });
});

describe("getPowerModifier", () => {
  it("is the basePower-independent factor that getEffectivePower multiplies by basePower", () => {
    const move = buildMove({ accuracy: 80, basePower: 90, critRatio: 2 });

    expect(getEffectivePower(move)).toBeCloseTo(move.basePower * getPowerModifier(move));
  });

  it("is unaffected by basePower itself", () => {
    const lowPower = buildMove({ basePower: 10, accuracy: 80, critRatio: 2 });
    const highPower = buildMove({ basePower: 200, accuracy: 80, critRatio: 2 });

    expect(getPowerModifier(lowPower)).toBeCloseTo(getPowerModifier(highPower));
  });
});
