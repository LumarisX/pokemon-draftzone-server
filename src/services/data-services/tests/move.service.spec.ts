import { getRuleset } from "../../../data/rulesets";
import { getEffectivePower } from "../move.service";

describe("MoveService", () => {
  let ruleset = getRuleset("Gen9 NatDex");

  describe("EffectivePower", () => {
    describe("Accuracy", () => {
      it("Focus Blast", () => {
        let move = ruleset.moves.get("Focus Blast");
        expect(move).toBeDefined();
        if (move) expect(getEffectivePower(move)).toEqual(84);
      });
      it("Hurricane", () => {
        let move = ruleset.moves.get("Hurricane");
        expect(move).toBeDefined();
        if (move) expect(getEffectivePower(move)).toEqual(77);
      });
    });
  });
});
