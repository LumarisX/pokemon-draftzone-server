import { CHAMPIONS_REGULATION_SOURCES } from "../../../mods/champions";
import { Ruleset, Rulesets } from "./rulesets";

const REGULATIONS = ["M-A", "M-B", "M-C", "M-D"] as const;

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
    for (const id of mc) expect(speciesIds("M-D").has(id)).toBe(true);
  });

  it("grows by the expected amount each regulation", () => {
    expect(speciesIds("M-A").size).toBe(278);
    expect(speciesIds("M-B").size).toBe(316);
    expect(speciesIds("M-C").size).toBe(351);
    expect(speciesIds("M-D").size).toBe(359);
  });

  it("adds Heatran, the Latis, Tatsugiri and their megas in M-D", () => {
    const added = [
      "heatran",
      "heatranmega",
      "latias",
      "latiasmega",
      "latios",
      "latiosmega",
      "tatsugiri",
      "tatsugiricurlymega",
    ];
    for (const id of added) {
      expect(speciesIds("M-C").has(id)).toBe(false);
      expect(speciesIds("M-D").has(id)).toBe(true);
    }
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
    for (const id of mc) expect(itemIds("M-D").has(id)).toBe(true);
  });

  it("gates mega stones with the species they evolve", () => {
    for (const stone of ["heatranite", "latiasite", "latiosite", "tatsugirinite"]) {
      expect(itemIds("M-C").has(stone)).toBe(false);
      expect(itemIds("M-D").has(stone)).toBe(true);
    }
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
    expect(ruleset("M-D").moves.get("strengthsap")?.pp).toBe(5);
  });

  it("applies the M-D Rock Slide change only to M-D", () => {
    const mc = ruleset("M-C").moves.get("rockslide");
    const md = ruleset("M-D").moves.get("rockslide");
    expect(mc?.accuracy).toBe(90);
    expect(mc?.secondary?.chance).toBe(30);
    expect(md?.accuracy).toBe(95);
    expect(md?.secondary?.chance).toBe(20);
    expect(md?.secondary?.volatileStatus).toBe("flinch");
  });

  it("applies the M-D accuracy changes only to M-D", () => {
    for (const move of ["screech", "steelwing", "metalsound", "frostbreath"]) {
      expect(ruleset("M-C").moves.get(move)?.accuracy).not.toBe(100);
      expect(ruleset("M-D").moves.get(move)?.accuracy).toBe(100);
    }
  });

  it("adds the announced moves in M-D without dropping existing ones", async () => {
    const learns = (regulation: "M-C" | "M-D", species: string, move: string) =>
      ruleset(regulation).learnsets.canLearn(species, move);
    const gains: [string, string][] = [
      ["rotomwash", "psychup"],
      ["annihilape", "psychup"],
      ["emboar", "slackoff"],
      ["hydreigon", "roost"],
      ["emolga", "tailwind"],
      ["umbreon", "wonderroom"],
      ["glaceon", "playrough"],
    ];
    for (const [species, move] of gains) {
      expect(await learns("M-C", species, move)).toBe(false);
      expect(await learns("M-D", species, move)).toBe(true);
    }
    expect(await learns("M-D", "rotomwash", "hydropump")).toBe(true);
    expect(await learns("M-D", "umbreon", "foulplay")).toBe(true);
  });

  it("gives Heatran a learnset in M-D", async () => {
    expect(
      await ruleset("M-D").learnsets.canLearn("heatran", "magmastorm"),
    ).toBe(true);
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
