import { Data, Generation, Generations } from "@pkmn/data";
import { Dex, ModdedDex } from "@pkmn/dex";

export type Ruleset = {
  name: string;
  gen: Generation;
  restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea";
};

export type RulesetId = keyof typeof Rulesets;

class RulesetNew extends Generation {
  name: string;
  restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea";
  gen: Generation;
  constructor(
    dex: ModdedDex,
    exists: (d: Data) => boolean,
    name: string,
    options?: { restriction?: "Pentagon" | "Plus" | "Galar" | "Paldea" }
  ) {
    super(dex, exists);
    this.gen = this; //remove this eventually
    this.name = name;
    this.restriction = options?.restriction;
  }
}

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
  if (
    d.kind === "Move" &&
    d.isNonstandard &&
    d.isNonstandard !== "Past" &&
    d.isNonstandard !== "Unobtainable"
  ) {
    return false;
  }
  if (
    d.kind === "Species" &&
    (NATDEX_UNOBTAINABLE_SPECIES.includes(d.name) ||
      COSMETIC_SPECIES.includes(d.name) ||
      // (d.battleOnly &&
      //   !(
      //     d.forme == "Mega" ||
      //     d.forme == "Mega-X" ||
      //     d.forme == "Mega-Y" ||
      //     d.forme == "Crowned"
      //   )) ||
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

export const natdexGens = new Generations(Dex, NATDEX_EXISTS);

const Rulesets = {
  "Gen9 NatDex": { dex: Dex.forGen(9), existFn: NATDEX_EXISTS },
  "Paldea Dex": {
    dex: Dex.forGen(9),
    existFn: DRAFT_EXISTS,
    restriction: "Paldea",
  },
  "Gen8 NatDex": { dex: Dex.forGen(8), existFn: NATDEX_EXISTS },
  "Galar Dex": {
    dex: Dex.forGen(8),
    existFn: DRAFT_EXISTS,
    restriction: "Galar",
  },
  "Alola Dex": { dex: Dex.forGen(7), existFn: DRAFT_EXISTS },
  "Kalos Dex": { dex: Dex.forGen(6), existFn: DRAFT_EXISTS },
  "Unova Dex": { dex: Dex.forGen(5), existFn: DRAFT_EXISTS },
  "Sinnoh Dex": { dex: Dex.forGen(4), existFn: DRAFT_EXISTS },
  "Hoenn Dex": { dex: Dex.forGen(3), existFn: DRAFT_EXISTS },
  "Johto Dex": { dex: Dex.forGen(2), existFn: DRAFT_EXISTS },
  "Kanto Dex": { dex: Dex.forGen(1), existFn: DRAFT_EXISTS },
  // CAP: { gen: gens.get(9), natdex: true },
} as const;

export function getRuleset(rulesetId: string): RulesetNew {
  if (rulesetId && rulesetId in Rulesets) {
    const { dex, existFn } = Rulesets[rulesetId as RulesetId];
    return new RulesetNew(dex, existFn, rulesetId);
  } else throw new Error(`Ruleset Id not found: ${rulesetId}`);
}

export function getRulesets() {
  return Object.keys(Rulesets);
}
