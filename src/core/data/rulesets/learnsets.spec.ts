import { getRuleset, getRulesets } from "./rulesets";

const CHAMPIONS_REGULATIONS = ["Champions MA", "Champions MB", "Champions MC"];
const GOURGEIST_SIZES = [
  "Gourgeist-Small",
  "Gourgeist-Large",
  "Gourgeist-Super",
];

async function movepool(rulesetId: string, species: string) {
  const ruleset = getRuleset(rulesetId);
  const learnable = await ruleset.learnsets.learnable(
    species,
    ruleset.restriction,
  );
  return Object.keys(learnable ?? {}).sort();
}

describe("ruleset movepools", () => {
  it.each(CHAMPIONS_REGULATIONS)(
    "gives every Gourgeist size the Gourgeist movepool in %s",
    async (rulesetId) => {
      const gourgeist = await movepool(rulesetId, "Gourgeist");
      expect(gourgeist.length).toBeGreaterThan(0);
      for (const size of GOURGEIST_SIZES) {
        expect(await movepool(rulesetId, size)).toEqual(gourgeist);
      }
    },
  );

  it("gives every Gourgeist size the Legends: Z-A movepool in ZA NatDex", async () => {
    const gourgeist = await movepool("ZA NatDex", "Gourgeist");
    expect(gourgeist.length).toBeGreaterThan(0);
    for (const size of GOURGEIST_SIZES) {
      expect(await movepool("ZA NatDex", size)).toEqual(gourgeist);
    }
  });

  it.each(CHAMPIONS_REGULATIONS)(
    "never inherits moves from a prevo in %s",
    async (rulesetId) => {
      const own = await getRuleset(rulesetId).learnsets.get("venusaur");
      expect(await movepool(rulesetId, "Venusaur")).toEqual(
        Object.keys(own?.learnset ?? {}).sort(),
      );
    },
  );

  it("does not pass Kyurem's signature move to its fused formes", async () => {
    expect(await movepool("Gen9 NatDex", "Kyurem")).toContain("glaciate");
    expect(await movepool("Gen9 NatDex", "Kyurem-Black")).not.toContain(
      "glaciate",
    );
  });

  it.each(getRulesets())(
    "leaves no species without a movepool in %s",
    async (rulesetId) => {
      const ruleset = getRuleset(rulesetId);
      const empty: string[] = [];
      for (const species of ruleset.species) {
        if ((await movepool(rulesetId, species.name)).length === 0) {
          empty.push(species.name);
        }
      }
      expect(empty).toEqual([]);
    },
    120_000,
  );
});
