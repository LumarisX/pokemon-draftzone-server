import { getRuleset } from "../../../data/rulesets";
import { typeWeak } from "../type.services";

describe("TypeService", () => {
  let ruleset = getRuleset("Gen9 NatDex");

  describe("TypeWeak", () => {
    it("returns weakness for Fairy and Steel", () => {
      expect(typeWeak(["Fairy", "Steel"], ruleset)).toEqual({
        Bug: 0.25,
        Dark: 0.5,
        Dragon: 0,
        Electric: 1,
        Fairy: 0.5,
        Fighting: 1,
        Fire: 2,
        Flying: 0.5,
        Ghost: 1,
        Grass: 0.5,
        Ground: 2,
        Ice: 0.5,
        Normal: 0.5,
        Poison: 0,
        Psychic: 0.5,
        Rock: 0.5,
        Steel: 1,
        Water: 1,
      });
    });
  });
});
