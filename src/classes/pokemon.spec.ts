import { getRuleset } from "../data/rulesets";
import { DraftSpecie } from "./pokemon";

describe("Draft Pokemon", () => {
  describe("Gen9 NatDex", () => {
    const ruleset = getRuleset("Gen9 NatDex");
    describe("Rayquaza", () => {
      const species = ruleset.species.get("Rayquaza");
      it("should not be null", () => {
        expect(species).toBeTruthy();
      });
      if (!species) return;
      const draftSpecies = new DraftSpecie(species, ruleset);

      it("should know V-Create", async () => {
        expect(
          (await draftSpecies.learnset()).map((move) => move.id)
        ).toContain("vcreate");
      });
    });
  });
});
