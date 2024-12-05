import { Data, Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export type RulesetId = keyof typeof Rulesets & string;

export type Ruleset = {
  name: string;
  gen: Generation;
  restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea";
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
  if ("isNonstandard" in d && d.isNonstandard && d.isNonstandard !== "Past") {
    if ("tier" in d && d.tier === "Unreleased") return false;
    if (d.isNonstandard === "CAP") return false;
    if (d.isNonstandard === "Custom") return false;
  }
  if (d.kind === "Move" && d.isNonstandard && d.isNonstandard !== "Past") {
    return false;
  }
  if (
    d.kind === "Species" &&
    (NATDEX_UNOBTAINABLE_SPECIES.includes(d.name) ||
      COSMETIC_SPECIES.includes(d.name) ||
      (d.battleOnly &&
        !(
          d.forme == "Mega" ||
          d.forme == "Mega-X" ||
          d.forme == "Mega-Y" ||
          d.forme == "Crowned"
        )) ||
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
  "Gen9 NatDex": { name: "Gen9 NatDex", gen: natdexGens.get(9) },
  "Paldea Dex": {
    name: "Gen9 NatDex",
    gen: gens.get(9),
    restriction: "Paldea",
  },
  "Gen8 NatDex": { name: "Gen8 NatDex", gen: natdexGens.get(8) },
  "Galar Dex": { name: "Galar Dex", gen: gens.get(8), restriction: "Galar" },
  "Alola Dex": { name: "Alola Dex", gen: gens.get(7) },
  "Kalos Dex": { name: "Kalos Dex", gen: gens.get(6) },
  "Unova Dex": { name: "Unova Dex", gen: gens.get(5) },
  "Sinnoh Dex": { name: "Sinnoh Dex", gen: gens.get(4) },
  "Hoenn Dex": { name: "Hoenn Dex", gen: gens.get(3) },
  "Johto Dex": { name: "Johto Dex", gen: gens.get(2) },
  "Kanto Dex": { name: "Kanto Dex", gen: gens.get(1) },
  // CAP: { gen: gens.get(9), natdex: true },
};

export function getRuleset(rulesetId: string) {
  if (rulesetId && rulesetId in Rulesets) return Rulesets[rulesetId];
  else throw new Error(`Ruleset Id not found: ${rulesetId}`);
}

export function getRulesets() {
  return Object.keys(Rulesets);
}
