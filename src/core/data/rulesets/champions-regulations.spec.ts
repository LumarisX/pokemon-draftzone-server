import { CHAMPIONS_REGULATION_SOURCES } from "../../../mods/champions";
import { Ruleset, Rulesets } from "./rulesets";

const REGULATIONS = ["M-A", "M-B", "M-C"] as const;

const ruleset = (regulation: (typeof REGULATIONS)[number]): Ruleset =>
  Rulesets["Champions"][regulation].ruleset;

const speciesIds = (regulation: (typeof REGULATIONS)[number]): Set<string> => {
  const ids = new Set<string>();
  for (const specie of ruleset(regulation).species) ids.add(specie.id);
  return ids;
};

const itemIds = (regulation: (typeof REGULATIONS)[number]): Set<string> => {
  const ids = new Set<string>();
  for (const item of ruleset(regulation).items) ids.add(item.id);
  return ids;
};

describe("champions regulation legality", () => {
  it("is strictly additive across regulations", () => {
    const ma = speciesIds("M-A");
    const mb = speciesIds("M-B");
    const mc = speciesIds("M-C");
    for (const id of ma) expect(mb.has(id)).toBe(true);
    for (const id of mb) expect(mc.has(id)).toBe(true);
  });

  it("grows by the expected amount each regulation", () => {
    expect(speciesIds("M-A").size).toBe(278);
    expect(speciesIds("M-B").size).toBe(316);
    expect(speciesIds("M-C").size).toBe(351);
  });

  it("gates later-regulation species", () => {
    expect(speciesIds("M-A").has("eelektrossmega")).toBe(false);
    expect(speciesIds("M-B").has("eelektrossmega")).toBe(true);
    expect(speciesIds("M-A").has("golisopod")).toBe(false);
    expect(speciesIds("M-B").has("golisopod")).toBe(false);
    expect(speciesIds("M-C").has("golisopod")).toBe(true);
  });

  it("keeps both Meowstic formes and their megas together", () => {
    for (const regulation of REGULATIONS) {
      const species = speciesIds(regulation);
      expect(species.has("meowstic")).toBe(true);
      expect(species.has("meowsticf")).toBe(true);
      expect(species.has("meowsticmmega")).toBe(true);
      expect(species.has("meowsticfmega")).toBe(true);
    }
  });
});

describe("champions regulation items", () => {
  it("is strictly additive across regulations", () => {
    const ma = itemIds("M-A");
    const mb = itemIds("M-B");
    const mc = itemIds("M-C");
    for (const id of ma) expect(mb.has(id)).toBe(true);
    for (const id of mb) expect(mc.has(id)).toBe(true);
  });

  it("gates mega stones with the species they evolve", () => {
    expect(itemIds("M-A").has("eelektrossite")).toBe(false);
    expect(itemIds("M-B").has("eelektrossite")).toBe(true);
    expect(itemIds("M-B").has("salamencite")).toBe(false);
    expect(itemIds("M-C").has("salamencite")).toBe(true);
  });

  it("never offers a mega stone whose holder is illegal", () => {
    const orphans: string[] = [];
    for (const regulation of REGULATIONS) {
      const species = speciesIds(regulation);
      for (const item of ruleset(regulation).items) {
        const holder = (item as { megaEvolves?: string }).megaEvolves;
        if (!holder) continue;
        const holderId = holder.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!species.has(holderId)) {
          orphans.push(`${regulation}: ${item.id} -> ${holderId}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe("champions regulation moves", () => {
  it("keeps per-regulation move overrides apart", () => {
    expect(ruleset("M-A").moves.get("strengthsap")?.pp).toBe(10);
    expect(ruleset("M-B").moves.get("strengthsap")?.pp).toBe(10);
    expect(ruleset("M-C").moves.get("strengthsap")?.pp).toBe(5);
  });
});

describe("champions regulation sources", () => {
  it("pins the upstream ref each regulation was generated from", () => {
    expect(CHAMPIONS_REGULATION_SOURCES["M-A"]).toEqual({
      path: "data/mods/championsregma",
      ref: "81c39fb3facd0c82bc6753295b2b079190fa3e6f",
    });
    expect(CHAMPIONS_REGULATION_SOURCES["M-B"].path).toBe(
      "data/mods/championsregmb",
    );
    expect(CHAMPIONS_REGULATION_SOURCES["M-C"].path).toBe(
      "data/mods/champions",
    );
  });
});
