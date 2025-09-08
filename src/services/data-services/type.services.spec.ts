import { typeWeak } from "./type.services";
import { getRuleset, Ruleset } from "../../data/rulesets";
import { TypeName } from "@pkmn/data";

describe("typeWeak", () => {
  let ruleset: Ruleset;

  beforeEach(() => {
    ruleset = getRuleset("Gen9 NatDex");
  });

  it("should correctly calculate weaknesses for a single type (Normal)", () => {
    const result = typeWeak(["Normal"], ruleset);
    expect(result).toEqual({
      Bug: 1,
      Dark: 1,
      Dragon: 1,
      Electric: 1,
      Fairy: 1,
      Fighting: 2,
      Fire: 1,
      Flying: 1,
      Ghost: 0,
      Grass: 1,
      Ground: 1,
      Ice: 1,
      Normal: 1,
      Poison: 1,
      Psychic: 1,
      Rock: 1,
      Steel: 1,
      Water: 1,
    });
  });

  it("should correctly calculate weaknesses for a single type (Flying)", () => {
    const result = typeWeak(["Flying"], ruleset);
    expect(result).toEqual({
      Bug: 0.5,
      Dark: 1,
      Dragon: 1,
      Electric: 2,
      Fairy: 1,
      Fighting: 0.5,
      Fire: 1,
      Flying: 1,
      Ghost: 1,
      Grass: 0.5,
      Ground: 0,
      Ice: 2,
      Normal: 1,
      Poison: 1,
      Psychic: 1,
      Rock: 2,
      Steel: 1,
      Water: 1,
    });
  });

  it("should correctly calculate weaknesses for dual types (Fire/Water)", () => {
    const result = typeWeak(["Fire", "Water"], ruleset);
    expect(result).toEqual({
      Bug: 0.5,
      Dark: 1,
      Dragon: 1,
      Electric: 2,
      Fairy: 0.5,
      Fighting: 1,
      Fire: 0.25,
      Flying: 1,
      Ghost: 1,
      Grass: 1,
      Ground: 2,
      Ice: 0.25,
      Normal: 1,
      Poison: 1,
      Psychic: 1,
      Rock: 2,
      Steel: 0.25,
      Water: 1,
    });
  });

  it("should return an empty object if types are not found in ruleset", () => {
    const result = typeWeak(["UnknownType" as TypeName], ruleset);
    expect(result).toEqual({});
  });

  it("should handle types with no damageTaken entries", () => {
    const result = typeWeak(["NoDamageType" as TypeName], ruleset);
    expect(result).toEqual({});
  });
});
