import { getRuleset } from "../data/rulesets";
import { DraftSpecies } from "./pokemon";

describe("Draft Pokemon", () => {
  describe("Gen9 NatDex", () => {
    const ruleset = getRuleset("Gen9 NatDex");
    describe("Rayquaza", () => {
      const species = ruleset.species.get("Rayquaza");
      it("should but not null", () => {
        expect(species).toBeTruthy();
      });
      if (!species) return;
      const draftSpecies = new DraftSpecies(species, {}, ruleset);

      it("should know V-Create", async () => {
        expect(
          (await draftSpecies.learnset()).map((move) => move.id)
        ).toContain("vcreate");
      });
    });
  });
});
