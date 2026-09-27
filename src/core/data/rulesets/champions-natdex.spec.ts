import { getRuleset, getRulesets, Ruleset } from "./rulesets";

const natdex = (): Ruleset => getRuleset("Champions NatDex");
const head = (): Ruleset => getRuleset("Champions MC");
const gen9 = (): Ruleset => getRuleset("Gen9 NatDex");

const ids = (entries: Iterable<{ id: string }>): Set<string> => {
  const result = new Set<string>();
  for (const entry of entries) result.add(entry.id);
  return result;
};

const movepool = async (ruleset: Ruleset, species: string) =>
  Object.keys((await ruleset.learnsets.learnable(species)) ?? {});

describe("champions national dex", () => {
  it("is advertised under its own id", () => {
    expect(getRulesets()).toContain("Champions NatDex");
    expect(natdex().statSystem).toBe("statPoints");
  });

  it("is exactly the union of the newest regulation and gen 9 national dex", () => {
    const species = ids(natdex().species);
    const expected = new Set([...ids(head().species), ...ids(gen9().species)]);
    expect(species).toEqual(expected);

    const items = ids(natdex().items);
    const expectedItems = new Set([...ids(head().items), ...ids(gen9().items)]);
    expect(items).toEqual(expectedItems);
  });

  it("keeps champions-only megas and national dex species together", () => {
    const species = ids(natdex().species);
    expect(species.has("meowsticmmega")).toBe(true);
    expect(species.has("bulbasaur")).toBe(true);
    expect(species.has("zacian")).toBe(true);
    expect(species.has("venusaurgmax")).toBe(false);
  });

  it("takes tiers from champions first and gen 9 national dex otherwise", () => {
    expect(natdex().species.get("venusaur")?.natDexTier).toBe(
      head().species.get("venusaur")?.tier,
    );
    expect(natdex().species.get("zacian")?.natDexTier).toBe(
      gen9().species.get("zacian")?.natDexTier,
    );
  });

  it("keeps champions move mechanics without champions move availability", () => {
    expect(natdex().moves.get("strengthsap")?.pp).toBe(5);
    expect(head().moves.get("absorb")?.isNonstandard).toBe("Past");
    expect(natdex().moves.get("absorb")?.isNonstandard).toBeFalsy();
  });

  it("unions the champions movepool with every move ever learned", async () => {
    const own = await movepool(head(), "venusaur");
    const past = await movepool(gen9(), "venusaur");
    const combined = await movepool(natdex(), "venusaur");
    expect(new Set(combined)).toEqual(new Set([...own, ...past]));
    expect(await natdex().learnsets.canLearn("venusaur", "hiddenpower")).toBe(
      true,
    );
    expect(await head().learnsets.canLearn("venusaur", "hiddenpower")).toBe(
      false,
    );
  });

  it("falls back to the base forme for megas gen 9 does not have", async () => {
    const mega = await movepool(natdex(), "raichumegax");
    const base = await movepool(gen9(), "raichu");
    for (const move of base) expect(mega).toContain(move);
  });

  it("leaves the champions regulation itself untouched", () => {
    expect(ids(head().species).size).toBe(351);
    expect(ids(gen9().species).size).toBe(1258);
  });
});
