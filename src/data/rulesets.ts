import { Data, Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export type RulesetId = keyof typeof Rulesets & string;

export type Ruleset = {
  gen: Generation;
  natdex: boolean;
};

const NATDEX_UNOBTAINABLE_SPECIES = [
  "Eevee-Starter",
  "Floette-Eternal",
  "Pichu-Spiky-eared",
  "Pikachu-Belle",
  "Pikachu-Cosplay",
  "Pikachu-Libre",
  "Pikachu-PhD",
  "Pikachu-Pop-Star",
  "Pikachu-Rock-Star",
  "Pikachu-Starter",
  "Eternatus-Eternamax",
];

const COSMETIC_SPECIES = [
  "Maushold-Four",
  "Sinistea-Antique",
  "Polteageist-Antique",
  "Dudunsparce-Three-Segment",
  "Poltchageist-Artisan",
  "Sinistcha-Masterpiece",
  "Magearna-Original",
  "Pikachu-Original",
  "Pikachu-Hoenn",
  "Pikachu-Sinnoh",
  "Pikachu-Unova",
  "Pikachu-Kalos",
  "Pikachu-Alola",
  "Pikachu-Partner",
  "Pikachu-World",
  "Basculin-Blue-Striped",
  "Vivillon-Pokeball",
  "Vivillon-Fancy",
];

const DRAFT_EXISTS = (d: Data) => {
  if (!NATDEX_EXISTS(d)) return false;
  if ("isNonstandard" in d && d.isNonstandard) return false;
  return !("tier" in d && ["Illegal"].includes(d.tier));
};

const NATDEX_EXISTS = (d: Data) => {
  if (!d.exists) return false;
  if (d.kind === "Ability" && d.id === "noability") return false;
  if ("isNonstandard" in d && d.isNonstandard && d.isNonstandard !== "Past")
    return false;
  if ("tier" in d && d.tier === "Unreleased") return false;
  if (
    d.kind === "Species" &&
    (NATDEX_UNOBTAINABLE_SPECIES.includes(d.name) ||
      COSMETIC_SPECIES.includes(d.name) ||
      (d.battleOnly &&
        !(d.forme == "Mega" || d.forme == "Mega-X" || d.forme == "Mega-Y")) ||
      d.forme === "Totem" ||
      d.forme === "Alola-Totem")
  )
    return false;
  return !(
    d.kind === "Item" &&
    ["Past", "Unobtainable"].includes(d.isNonstandard!) &&
    !d.zMove &&
    !d.itemUser &&
    !d.forcedForme
  );
};

const gens = new Generations(Dex, DRAFT_EXISTS);
export const natdexGens = new Generations(Dex, NATDEX_EXISTS);

const Rulesets: {
  [key: string]: Ruleset;
} = {
  "Gen9 NatDex": { gen: natdexGens.get(9), natdex: true },
  "Paldea Dex": { gen: gens.get(9), natdex: false },
  "Gen8 NatDex": { gen: natdexGens.get(8), natdex: true },
  "Galar Dex": { gen: gens.get(8), natdex: false },
  "Gen7 NatDex": { gen: natdexGens.get(7), natdex: true },
  "Alola Dex": { gen: gens.get(7), natdex: false },
  "Gen6 NatDex": { gen: natdexGens.get(6), natdex: true },
  "Kalos Dex": { gen: gens.get(6), natdex: false },
  "Gen5 NatDex": { gen: natdexGens.get(5), natdex: true },
  "Unova Dex": { gen: gens.get(5), natdex: false },
  "Gen4 NatDex": { gen: natdexGens.get(4), natdex: true },
  "Sinnoh Dex": { gen: gens.get(4), natdex: false },
  "Gen3 NatDex": { gen: natdexGens.get(3), natdex: true },
  "Hoenn Dex": { gen: gens.get(3), natdex: false },
  "Gen2 NatDex": { gen: natdexGens.get(2), natdex: true },
  "Johto Dex": { gen: gens.get(2), natdex: false },
  "Kanto Dex": { gen: gens.get(1), natdex: false },
  // CAP: { gen: gens.get(9), natdex: true },
};

export function getRuleset(rulesetId?: string) {
  if (rulesetId && rulesetId in Rulesets) return Rulesets[rulesetId];
  else return Rulesets["Gen9 NatDex"];
}

export function getRulesets() {
  return Object.keys(Rulesets);
}
