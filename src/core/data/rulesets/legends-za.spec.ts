import {
  LEGENDS_ZA_NATIVE_SPECIES,
  LEGENDS_ZA_SOURCE,
} from "../../../mods/legends";
import { Rulesets } from "./rulesets";

const za = Rulesets["Gen 9"]["ZA National Dex"].ruleset;
const natdex = Rulesets["Gen 9"]["National Dex"].ruleset;

describe("ZA National Dex roster", () => {
  it("keeps the full national dex roster, not just the Z-A species", () => {
    const ids = new Set<string>();
    for (const specie of za.species) ids.add(specie.id);
    expect(ids.size).toBe(1304);
    expect(ids.size).toBeGreaterThan(LEGENDS_ZA_NATIVE_SPECIES.size);
    expect(ids.has("dragapult")).toBe(true);
    expect(ids.has("garchomp")).toBe(true);
  });

  it("records which species are native to Z-A without gating on it", () => {
    expect(LEGENDS_ZA_NATIVE_SPECIES.size).toBe(503);
    expect(LEGENDS_ZA_NATIVE_SPECIES.has("garchomp")).toBe(true);
    expect(LEGENDS_ZA_NATIVE_SPECIES.has("dragapult")).toBe(false);
  });
});

describe("ZA National Dex data", () => {
  it("uses Z-A movepools for Z-A species", async () => {
    const bulbasaur = await za.learnsets.get("bulbasaur");
    const charizard = await za.learnsets.get("charizard");
    expect(Object.keys(bulbasaur?.learnset ?? {})).toHaveLength(34);
    expect(Object.keys(charizard?.learnset ?? {})).toHaveLength(55);

    const gen9Bulbasaur = await natdex.learnsets.get("bulbasaur");
    expect(Object.keys(gen9Bulbasaur?.learnset ?? {}).length).toBeGreaterThan(
      34,
    );
  });

  it("falls back to gen 9 movepools for species Z-A does not cover", async () => {
    const za9 = await za.learnsets.get("dragapult");
    const natdex9 = await natdex.learnsets.get("dragapult");
    expect(Object.keys(za9?.learnset ?? {}).length).toBe(
      Object.keys(natdex9?.learnset ?? {}).length,
    );
  });

  it("applies the Z-A base stat overrides", () => {
    expect(za.species.get("starmiemega")?.baseStats.atk).toBe(140);
    expect(za.species.get("mawilemega")?.baseStats.atk).toBe(147);
    expect(za.species.get("medichammega")?.baseStats.atk).toBe(140);
    expect(natdex.species.get("mawilemega")?.baseStats.atk).toBe(105);
  });

  it("keeps gen 9 tiers for every species it shares with the national dex", () => {
    const mismatches: string[] = [];
    for (const specie of za.species) {
      const other = natdex.species.get(specie.id);
      if (other && other.tier !== specie.tier) {
        mismatches.push(`${specie.id}: ${other.tier} vs ${specie.tier}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("pins the upstream ref it was generated from", () => {
    expect(LEGENDS_ZA_SOURCE.path).toBe("data/mods/gen9legends");
    expect(LEGENDS_ZA_SOURCE.ref).toMatch(/^[0-9a-f]{40}$/);
  });
});
