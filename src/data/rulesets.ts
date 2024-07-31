import { Data, Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export type RulesetId = keyof typeof Rulesets & string;

export type Ruleset = {
  gen: Generation;
  natdex: boolean;
};

type Rulesets = {
  [key: string]: Ruleset;
};

const DEFAULT_EXISTS = (d: Data) => {
  if (!NATDEX_EXISTS(d)) return false;
  if ("isNonstandard" in d && d.isNonstandard) return false;
  if ("tier" in d && d.tier === "Illegal") return false;
  return true;
};

const NATDEX_EXISTS = (d: Data) => {
  if (!d.exists) return false;
  if (d.kind === "Ability" && d.id === "noability") return false;
  if ("isNonstandard" in d && d.isNonstandard && d.isNonstandard !== "Past")
    return false;
  if ("tier" in d && d.tier === "Unreleased") return false;
  if (d.kind === "Species" && d.forme === "Totem") return false;
  return !(
    d.kind === "Item" &&
    ["Past", "Unobtainable"].includes(d.isNonstandard!) &&
    !d.zMove &&
    !d.itemUser &&
    !d.forcedForme
  );
};

const gens = new Generations(Dex, DEFAULT_EXISTS);

const natDexGens = new Generations(Dex, NATDEX_EXISTS);

export const Rulesets: Rulesets = {
  "Gen9 NatDex": { gen: natDexGens.get(9), natdex: true },
  "Paldea Dex": { gen: gens.get(9), natdex: false },
  "Gen8 NatDex": { gen: natDexGens.get(8), natdex: true },
  "Galar Dex": { gen: gens.get(8), natdex: false },
  "Gen7 NatDex": { gen: natDexGens.get(7), natdex: true },
  "Alola Dex": { gen: gens.get(7), natdex: false },
  "Gen6 NatDex": { gen: natDexGens.get(6), natdex: true },
  "Kalos Dex": { gen: gens.get(6), natdex: false },
  "Gen5 NatDex": { gen: natDexGens.get(5), natdex: true },
  "Unova Dex": { gen: gens.get(5), natdex: false },
  "Gen4 NatDex": { gen: natDexGens.get(4), natdex: true },
  "Sinnoh Dex": { gen: gens.get(4), natdex: false },
  "Gen3 NatDex": { gen: natDexGens.get(3), natdex: true },
  "Hoenn Dex": { gen: gens.get(3), natdex: false },
  "Gen2 NatDex": { gen: natDexGens.get(2), natdex: true },
  "Johto Dex": { gen: gens.get(2), natdex: false },
  "Kanto Dex": { gen: gens.get(1), natdex: false },
  // CAP: { gen: gens.get(9), natdex: true },
};
